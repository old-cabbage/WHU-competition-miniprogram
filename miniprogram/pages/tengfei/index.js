// pages/bracketSvg/bracketSvg.js
Page({
  data: {
    x: 0,
    y: 0,
    scale: 1,
    svgSource: '',
    matches: [] // 添加比赛列表
  },

  onLoad() {
    // 确保云开发已初始化
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      wx.showToast({
        title: '请使用 2.2.3 或以上的基础库以使用云能力',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 获取SVG图片 (如果需要，可以取消注释)
    // wx.cloud.callFunction({
    //   name:'getBracketSvg',
    //   data:{ slug:'2025tengfeibei' },
    //   success: ({result})=>{
    //     this.setData({ svgSource: result.svg })
    //   },
    //   fail: (error) => {
    //     console.error('获取SVG失败：', error)
    //     wx.showToast({
    //       title: '获取比赛信息失败',
    //       icon: 'none',
    //       duration: 2000
    //     })
    //   }
    // })

    this.getMatches()
  },

  // 获取比赛列表的方法
  async getMatches() {
    wx.showLoading({
      title: '加载比赛信息...',
    })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('2025tengfeibeimatches').get()
      console.log('比赛列表获取成功：', res.data)

      const matches = res.data.map(match => ({
        ...match,
        hasVoted: false,
        voteFor: '',
        teamAVotes: 0, // 添加投票计数
        teamBVotes: 0 // 添加投票计数
      }))

      this.setData({
        matches: matches
      })

      // 获取比赛列表后检查用户投票状态
      await this.checkUserVote()

      // 获取每个比赛的投票总数
      const matchIds = this.data.matches.map(match => match.matchId)
      if (matchIds.length > 0) {
        await this.getMatchVoteCounts(matchIds)
      }

    } catch (error) {
      console.error('获取比赛列表失败：', error)
      wx.showToast({
        title: '获取比赛列表失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 获取比赛投票总数
  async getMatchVoteCounts(matchIds) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'gettengfeibeiMatchVoteCounts',
        data: {
          matchIds: matchIds
        }
      })

      console.log('投票统计云函数返回结果：', result)

      if (result && result.success && result.voteCounts) {
        const voteCounts = result.voteCounts
        const updatedMatches = this.data.matches.map(match => {
          const counts = voteCounts[match.matchId]
          if (counts) {
            return {
              ...match,
              teamAVotes: counts.teamAVotes || 0,
              teamBVotes: counts.teamBVotes || 0
            }
          } else {
            return match
          }
        })
        this.setData({
          matches: updatedMatches
        })
      }

    } catch (error) {
      console.error('获取投票统计失败：', error)
      // 可以在这里添加一个不那么打扰用户的提示，或者不提示
    }
  },

  // 检查用户是否已投票
  async checkUserVote() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOpenid'
      })

      console.log('云函数返回结果：', result) // 添加日志

      if (!result) {
        console.error('云函数返回结果为空')
        return
      }

      const openid = result.userInfo?.openId
      if (!openid) {
        console.error('未获取到用户openid')
        return
      }

      const db = wx.cloud.database()

      const matchIds = this.data.matches.map(match => match.matchId)
      if (matchIds.length === 0) {
        console.log('没有比赛可检查投票状态')
        return
      }

      const _ = db.command
      const votes = await db.collection('2025tengfeibeivotes').where({
        _openid: openid,
        matchId: _.in(matchIds)
      }).get()

      console.log('用户投票查询结果：', votes) // 添加日志

      if (votes.data.length > 0) {
        const userVotes = votes.data
        const updatedMatches = this.data.matches.map(match => {
          const userVote = userVotes.find(vote => vote.matchId === match.matchId)
          if (userVote) {
            return {
              ...match,
              hasVoted: true,
              voteFor: userVote.voteFor
            }
          } else {
            return match
          }
        })
        this.setData({
          matches: updatedMatches
        })
      }
    } catch (error) {
      console.error('检查投票状态失败：', error)
    }
  },

  // 投票逻辑
  async vote(e) {
    const { matchid, team } = e.currentTarget.dataset

    const matchIndex = this.data.matches.findIndex(m => m.matchId === matchid)
    if (matchIndex === -1) {
      console.error('未找到对应的比赛', matchid)
      wx.showToast({
        title: '比赛信息错误',
        icon: 'none'
      })
      return
    }

    const currentMatch = this.data.matches[matchIndex]

    if (currentMatch.hasVoted) {
      wx.showToast({
        title: '您已投过票',
        icon: 'none'
      })
      return
    }

    let loadingShown = false
    try {
      wx.showLoading({
        title: '投票中...',
      })
      loadingShown = true

      // 在客户端直接调用数据库add方法时，无需手动添加_openid
      const db = wx.cloud.database()
      await db.collection('2025tengfeibeivotes').add({
        data: {
          matchId: matchid,
          voteFor: team,
          voteTime: db.serverDate()
        }
      })

      // 投票成功后，重新获取该比赛的投票人数并更新前端显示
      await this.getMatchVoteCounts([matchid])

      // 更新前端投票状态
      const updatedMatches = this.data.matches.map(match => {
        if (match.matchId === matchid) {
          return {
            ...match,
            hasVoted: true,
            voteFor: team
          }
        } else {
          return match
        }
      })
      this.setData({
        matches: updatedMatches
      })

      wx.showToast({
        title: '投票成功',
        icon: 'success'
      })

    } catch (error) {
      console.error('投票失败：', error)
      wx.showToast({
        title: error.message || '投票失败，请重试',
        icon: 'none'
      })
    } finally {
      if (loadingShown) {
        wx.hideLoading()
      }
    }
  }
})
