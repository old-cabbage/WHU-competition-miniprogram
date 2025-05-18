const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const db = cloud.database()
    const $ = db.command.aggregate // 引入聚合操作符

    const { matchIds } = event

    if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
      return {
        success: false,
        error: '缺少有效的matchIds参数'
      }
    }

    // 使用聚合管道统计投票数
    const result = await db.collection('2025tengfeibeivotes').aggregate()
      .match({ // 过滤只包含传入的matchIds的投票记录
        matchId: $.in(matchIds)
      })
      .group({ // 按matchId和voteFor分组并计数
        _id: {
          matchId: '$matchId',
          voteFor: '$voteFor'
        },
        count: $.sum(1)
      })
      .end()

    console.log('投票统计结果：', result)

    // 将结果转换为更易于前端处理的格式
    const voteCounts = {};
    if (result.list) {
      result.list.forEach(item => {
        const { matchId, voteFor } = item._id;
        const count = item.count;
        if (!voteCounts[matchId]) {
          voteCounts[matchId] = { teamAVotes: 0, teamBVotes: 0 };
        }
        if (voteFor === 'teamA') {
          voteCounts[matchId].teamAVotes = count;
        } else if (voteFor === 'teamB') {
          voteCounts[matchId].teamBVotes = count;
        }
      });
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