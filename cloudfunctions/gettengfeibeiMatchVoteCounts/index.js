const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const db = cloud.database()
    const $ = db.command.aggregate

    const { matchIds } = event

    if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
      return {
        success: false,
        error: '缺少有效的matchIds参数'
      }
    }

    // 首先尝试从缓存获取数据
    const cacheResults = await db.collection('2025tengfeibeivotecache')
      .where({
        _id: $.in(matchIds)
      })
      .get()

    const voteCounts = {}
    const missingMatchIds = []

    // 处理缓存数据
    if (cacheResults.data && cacheResults.data.length > 0) {
      cacheResults.data.forEach(cache => {
        voteCounts[cache._id] = {
          teamAVotes: cache.teamAVotes || 0,
          teamBVotes: cache.teamBVotes || 0
        }
      })
    }

    // 找出没有缓存的比赛ID
    matchIds.forEach(matchId => {
      if (!voteCounts[matchId]) {
        missingMatchIds.push(matchId)
      }
    })

    // 如果有缺失的缓存，则实时计算
    if (missingMatchIds.length > 0) {
      const result = await db.collection('2025tengfeibeivotes').aggregate()
        .match({
          matchId: $.in(missingMatchIds)
        })
        .group({
          _id: {
            matchId: '$matchId',
            voteFor: '$voteFor'
          },
          count: $.sum(1)
        })
        .end()

      if (result.list) {
        result.list.forEach(item => {
          const { matchId, voteFor } = item._id
          const count = item.count
          if (!voteCounts[matchId]) {
            voteCounts[matchId] = { teamAVotes: 0, teamBVotes: 0 }
          }
          if (voteFor === 'teamA') {
            voteCounts[matchId].teamAVotes = count
          } else if (voteFor === 'teamB') {
            voteCounts[matchId].teamBVotes = count
          }
        })

        // 将新计算的统计数据写入缓存
        for (const matchId of missingMatchIds) {
          const counts = voteCounts[matchId]
          if (counts) {
            try {
              await db.collection('2025tengfeibeivotecache').doc(matchId).set({
                data: {
                  _id: matchId,
                  teamAVotes: counts.teamAVotes,
                  teamBVotes: counts.teamBVotes,
                  lastUpdated: db.serverDate()
                }
              })
            } catch (error) {
              if (error.errCode === -1) {
                await db.collection('2025tengfeibeivotecache').add({
                  data: {
                    _id: matchId,
                    teamAVotes: counts.teamAVotes,
                    teamBVotes: counts.teamBVotes,
                    lastUpdated: db.serverDate()
                  }
                })
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      voteCounts: voteCounts
    }

  } catch (error) {
    console.error('获取投票统计失败：', error)
    return {
      success: false,
      error: error.message || '未知错误'
    }
  }
} 