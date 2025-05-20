const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const db = cloud.database()
    const $ = db.command.aggregate

    const { matchId, voteFor, operation } = event // operation: 'add' 或 'remove'

    if (!matchId || !voteFor || !operation) {
      return {
        success: false,
        error: '参数不完整'
      }
    }

    let currentCache = null;

    // 尝试获取当前缓存，如果不存在则不处理错误
    try {
      const cacheDoc = await db.collection('2025tengfeibeivotecache').doc(matchId).get()
      currentCache = cacheDoc.data
    } catch (error) {
      // 文档不存在是预期情况，不抛出错误
      if (error.errCode !== -1) {
         console.error('获取投票缓存失败：', error)
         return {
           success: false,
           error: '获取缓存失败'
         }
      }
    }

    if (!currentCache) {
      // 如果缓存不存在，创建新缓存
      currentCache = {
        _id: matchId,
        teamAVotes: 0,
        teamBVotes: 0,
        lastUpdated: db.serverDate()
      }
    }

    // 更新投票数
    if (operation === 'add') {
      if (voteFor === 'teamA') {
        currentCache.teamAVotes += 1
      } else if (voteFor === 'teamB') {
        currentCache.teamBVotes += 1
      }
    } else if (operation === 'remove') {
      if (voteFor === 'teamA' && currentCache.teamAVotes > 0) {
        currentCache.teamAVotes -= 1
      } else if (voteFor === 'teamB' && currentCache.teamBVotes > 0) {
        currentCache.teamBVotes -= 1
      }
    }

    currentCache.lastUpdated = db.serverDate()

    // 更新或创建缓存
    try {
      await db.collection('2025tengfeibeivotecache').doc(matchId).set({
        data: currentCache
      })
    } catch (error) {
      // 如果文档不存在（第一次创建），则使用add
       if (error.errCode === -1) {
         await db.collection('2025tengfeibeivotecache').add({
           data: currentCache
         })
       } else {
         console.error('写入投票缓存失败：', error)
         throw error
       }
    }

    return {
      success: true,
      cache: currentCache
    }

  } catch (error) {
    console.error('更新投票缓存云函数异常：', error)
    return {
      success: false,
      error: error.message || '未知错误'
    }
  }
} 