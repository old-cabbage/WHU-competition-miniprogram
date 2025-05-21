// pages/bracketSvg/bracketSvg.js
Page({
  data: {
    x: 0,
    y: 0,
    scale: 1,
    svgSource: '',
    matches: [], // 添加比赛列表
    groupedMatches: { // 添加分组比赛列表
      inProgress: [],
      notStarted: [],
      ended: []
    },
    isLoading: false // 添加加载状态标志
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
    if (this.data.isLoading) return // 如果正在加载，则直接返回

    this.setData({ isLoading: true })
    
    try {
      const db = wx.cloud.database()
      const res = await db.collection('2025tengfeibeimatches').get()
      console.log('比赛列表获取成功：', res.data)

      let matches = res.data.map(match => {
        const matchTime = new Date(match.time.replace(' ', 'T'))
        const currentTime = new Date()
        const votingOpen = currentTime <= matchTime && match.state !== '已结束'

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
          teamAPercentage: 0,
          teamBPercentage: 0,
          votingOpen: votingOpen, // 更新 votingOpen 逻辑，已结束的比赛不能投票
          displayTime: displayTime,
          matchType: match.matchType,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          winner: match.state === '已结束' ? (match.scoreA > match.scoreB ? 'teamA' : (match.scoreB > match.scoreA ? 'teamB' : 'tie')) : null, // 比赛结束后才判断胜者
          state: match.state || '未进行' // Default to 未进行 if state is missing
        }
      })

      // 根据 state 排序: 进行中 -> 未进行 -> 已结束
      // 同状态下按时间倒序排序
      const stateOrder = { '进行中': 1, '未进行': 2, '已结束': 3 };
      matches.sort((a, b) => {
        const stateComparison = (stateOrder[a.state] || 4) - (stateOrder[b.state] || 4);
        if (stateComparison !== 0) {
          return stateComparison;
        }
        // 如果 state 相同，按时间倒序排
        return new Date(b.time.replace(' ', 'T')).getTime() - new Date(a.time.replace(' ', 'T')).getTime();
      });

      // 分组比赛
      const groupedMatches = {
        inProgress: matches.filter(match => match.state === '进行中'),
        notStarted: matches.filter(match => match.state === '未进行'),
        ended: matches.filter(match => match.state === '已结束')
      };

      this.setData({
        matches: matches, // Retain the sorted flat list for checkUserVote etc.
        groupedMatches: groupedMatches
      })

      // 获取比赛列表后检查用户投票状态
      await this.checkUserVote()

      // 获取所有比赛的投票总数
      const matchIds = matches.map(match => match.matchId)

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
      this.setData({ isLoading: false })
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
        // 更新 matches 和 groupedMatches 中的投票数据
        const updateMatchData = (match) => {
           const counts = voteCounts[match.matchId]
          if (counts) {
            const totalVotes = (counts.teamAVotes || 0) + (counts.teamBVotes || 0)
            const teamAPercentage = totalVotes > 0 ? Math.round(((counts.teamAVotes || 0) / totalVotes) * 100) : 0
            const teamBPercentage = 100 - teamAPercentage

            return {
              ...match,
              teamAVotes: counts.teamAVotes || 0,
              teamBVotes: counts.teamBVotes || 0,
              teamAPercentage: teamAPercentage,
              teamBPercentage: teamBPercentage
            }
          } else {
            return match
          }
        }

        const updatedMatches = this.data.matches.map(updateMatchData);

        const updatedGroupedMatches = {
           inProgress: this.data.groupedMatches.inProgress.map(updateMatchData),
           notStarted: this.data.groupedMatches.notStarted.map(updateMatchData),
           ended: this.data.groupedMatches.ended.map(updateMatchData),
        }

        this.setData({
          matches: updatedMatches,
          groupedMatches: updatedGroupedMatches
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

      // 使用 data.matches，它是所有比赛的扁平列表
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
        // 更新 matches 和 groupedMatches 的 hasVoted 和 voteFor 状态
        const updateMatchVoteStatus = (match) => {
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
        }

        const updatedMatches = this.data.matches.map(updateMatchVoteStatus);

        const updatedGroupedMatches = {
           inProgress: this.data.groupedMatches.inProgress.map(updateMatchVoteStatus),
           notStarted: this.data.groupedMatches.notStarted.map(updateMatchVoteStatus),
           ended: this.data.groupedMatches.ended.map(updateMatchVoteStatus),
        }

        this.setData({
          matches: updatedMatches, // Keep matches updated as well
          groupedMatches: updatedGroupedMatches
        })
      }
    } catch (error) {
      console.error('检查投票状态失败：', error)
    }
  },

  // 投票逻辑
  async vote(e) {
    if (this.data.isLoading) return // 如果正在加载，则直接返回

    const { matchid, team } = e.currentTarget.dataset

    // 在 groupedMatches 中找到对应的比赛
    let matchToUpdate = null;
    let groupKey = '';
    for (const key in this.data.groupedMatches) {
        const foundMatch = this.data.groupedMatches[key].find(m => m.matchId === matchid);
        if (foundMatch) {
            matchToUpdate = foundMatch;
            groupKey = key;
            break;
        }
    }

    if (!matchToUpdate) {
      console.error('未找到对应的比赛', matchid)
      wx.showToast({
        title: '比赛信息错误',
        icon: 'none'
      })
      return
    }

    // 双重校验：如果比赛未开启投票或已投票，直接返回并给出提示
    if (!matchToUpdate.votingOpen) {
        wx.showToast({
            title: '该比赛已开始或已结束',
            icon: 'none'
        });
        return;
    }

    if (matchToUpdate.hasVoted) {
        wx.showToast({
            title: '您已支持过',
            icon: 'none'
        });
        return;
    }

    this.setData({ isLoading: true })
    let loadingShown = false
    try {
      wx.showLoading({
        title: '进行中...',
      })
      loadingShown = true

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

        // 找到当前比赛在 groupedMatches 中的索引并更新
        const matchIndexInGroup = this.data.groupedMatches[groupKey].findIndex(m => m.matchId === matchid);

        if (matchIndexInGroup !== -1) {
          const updatedGroup = [...this.data.groupedMatches[groupKey]];
          updatedGroup[matchIndexInGroup] = {
            ...updatedGroup[matchIndexInGroup],
            hasVoted: true,
            voteFor: team,
            teamAVotes: counts.teamAVotes || 0,
            teamBVotes: counts.teamBVotes || 0,
            teamAPercentage: teamAPercentage,
            teamBPercentage: teamBPercentage
          };

          // 使用setData更新页面显示
          this.setData({
            groupedMatches: {
                ...this.data.groupedMatches,
                [groupKey]: updatedGroup
            }
          });
        }

         // 同时更新 matches 列表以保持数据一致性（如果需要的话，尽管当前 WXML 似乎主要使用 groupedMatches）
        const matchIndexInFlatList = this.data.matches.findIndex(m => m.matchId === matchid);
         if (matchIndexInFlatList !== -1) {
             const updatedFlatList = [...this.data.matches];
              updatedFlatList[matchIndexInFlatList] = {
                 ...updatedFlatList[matchIndexInFlatList],
                 hasVoted: true,
                 voteFor: team,
                 teamAVotes: counts.teamAVotes || 0,
                 teamBVotes: counts.teamBVotes || 0,
                 teamAPercentage: teamAPercentage,
                 teamBPercentage: teamBPercentage
             };
             this.setData({ matches: updatedFlatList });
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
        this.setData({ isLoading: false })
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
