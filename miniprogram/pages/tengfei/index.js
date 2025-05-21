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
      const res = await db.collection('2025tengfeibeimatches').orderBy('time', 'desc').get()
      console.log('比赛列表获取成功：', res.data)

      const matches = res.data.map(match => {
        const matchTime = new Date(match.time.replace(' ', 'T')) // Use time with T for internal logic
        const currentTime = new Date()
        const votingOpen = currentTime <= matchTime

        // Format time for display
        const dateObj = new Date(match.time.replace(' ', 'T'));
        const year = dateObj.getFullYear();
        const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
        const day = ('0' + dateObj.getDate()).slice(-2);
        const hours = ('0' + dateObj.getHours()).slice(-2);
        const minutes = ('0' + dateObj.getMinutes()).slice(-2);
        const displayTime = `${year}-${month}-${day} ${hours}:${minutes}`;

        return {
          ...match,
          hasVoted: false,
          voteFor: '',
          teamAVotes: 0,
          teamBVotes: 0,
          teamAPercentage: 0, // 添加百分比字段
          teamBPercentage: 0, // 添加百分比字段
          votingOpen: votingOpen, // Add voting status flag
          displayTime: displayTime, // Add formatted time for display
          matchType: match.matchType // Add match type
        }
      })

      this.setData({
        matches: matches
      })

      // 获取比赛列表后检查用户投票状态
      await this.checkUserVote()

      // 只获取已投票比赛的投票总数 或者 投票已关闭的比赛的总数
      const matchesToGetCounts = this.data.matches.filter(match => match.hasVoted || !match.votingOpen)

      const matchIds = matchesToGetCounts.map(match => match.matchId)

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
            const totalVotes = (counts.teamAVotes || 0) + (counts.teamBVotes || 0)
            const teamAPercentage = totalVotes > 0 ? Math.round(((counts.teamAVotes || 0) / totalVotes) * 100) : 0
            // Ensure percentages add up to 100%, assign remainder to team B
            const teamBPercentage = 100 - teamAPercentage


            return {
              ...match,
              teamAVotes: counts.teamAVotes || 0,
              teamBVotes: counts.teamBVotes || 0,
              teamAPercentage: teamAPercentage, // 更新百分比
              teamBPercentage: teamBPercentage // 更新百分比
            }
          } else {
            // If no counts for a match (e.g., no votes yet and voting open), keep percentages at 0
            // Also keep existing vote counts if they exist from a previous state before the fetch
            return {
              ...match,
              teamAVotes: match.teamAVotes || 0, // Preserve existing count if fetch failed for this match
              teamBVotes: match.teamBVotes || 0, // Preserve existing count if fetch failed for this match
              teamAPercentage: 0,
              teamBPercentage: 0
            }
          }
        })
        this.setData({
          matches: updatedMatches
        })
      } else {
         console.error('获取投票统计失败：云函数返回success为false或无voteCounts', result)
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

    // 双重校验：如果比赛未开启投票或已投票，直接返回并给出提示
    if (!currentMatch.votingOpen) {
        wx.showToast({
            title: '该比赛已开始或已结束',
            icon: 'none'
        });
        return;
    }

    if (currentMatch.hasVoted) {
        wx.showToast({
            title: '您已支持过',
            icon: 'none'
        });
        return;
    }

    let loadingShown = false
    try {
      wx.showLoading({
        title: '进行中...',
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

      // 更新投票缓存
      await wx.cloud.callFunction({
        name: 'updateTengfeibeiVoteCache',
        data: {
          matchId: matchid,
          voteFor: team,
          operation: 'add'
        }
      })

      // 投票成功后，获取当前比赛的最新投票数并更新前端显示
      const { result: voteCountsResult } = await wx.cloud.callFunction({
        name: 'gettengfeibeiMatchVoteCounts',
        data: {
          matchIds: [matchid]
        }
      });

      if (voteCountsResult && voteCountsResult.success && voteCountsResult.voteCounts) {
        const counts = voteCountsResult.voteCounts[matchid];
        const totalVotes = (counts.teamAVotes || 0) + (counts.teamBVotes || 0);
        const teamAPercentage = totalVotes > 0 ? Math.round(((counts.teamAVotes || 0) / totalVotes) * 100) : 0;
        const teamBPercentage = 100 - teamAPercentage;

        // 找到当前比赛在matches数组中的索引
        const currentMatchIndex = this.data.matches.findIndex(m => m.matchId === matchid);

        if (currentMatchIndex !== -1) {
          // 更新matches数组中当前比赛的数据
          const updatedMatches = [...this.data.matches]; // 创建副本
          updatedMatches[currentMatchIndex] = {
            ...updatedMatches[currentMatchIndex],
            hasVoted: true,
            voteFor: team,
            teamAVotes: counts.teamAVotes || 0,
            teamBVotes: counts.teamBVotes || 0,
            teamAPercentage: teamAPercentage,
            teamBPercentage: teamBPercentage
          };

          // 使用setData更新页面显示
          this.setData({
            matches: updatedMatches
          });
        }
      } else {
         console.error('获取当前比赛统计失败：', voteCountsResult)
      }

        wx.showToast({
          title: '支持成功',
          icon: 'success'
        })

      } catch (error) {
        console.error('支持失败：', error)
        wx.showToast({
          title: error.message || '支持失败，请重试',
          icon: 'none'
        })
      } finally {
        if (loadingShown) {
          wx.hideLoading()
        }
      }
    },

  onShareAppMessage: function () {
    return {
      title: '腾飞杯 - 珞珈竞赛',
      path: '/pages/tengfei/index?from=share&page=tengfei',
      imageUrl: '/images/icons/logo.png'
    }
  },

  onShareTimeline: function () {
    return {
      title: '腾飞杯 - 珞珈竞赛',
      query: 'from=timeline&page=tengfei',
      imageUrl: '/images/icons/logo.png'
    }
  }
})
