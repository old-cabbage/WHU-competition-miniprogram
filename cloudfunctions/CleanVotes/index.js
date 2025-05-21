const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  console.log('定时清理投票函数被触发');

  // 检查调用来源是否为定时触发器
  const wxContext = cloud.getWXContext();
  if (wxContext.SOURCE !== 'wx_trigger') {
    console.warn('CleanVotes 函数未通过定时触发器调用，拒绝执行', wxContext.SOURCE);
    return { success: false, error: '非法调用来源' };
  }

  const collectionName = '2025tengfeibeivotes'; // 硬编码集合名称

  const db = cloud.database();

  try {
    // 1. 查询所有投票记录
    const votes = await db.collection(collectionName).get();

    if (!votes.data || votes.data.length === 0) {
      console.log('没有投票记录需要清理');
      return { success: true, message: '没有投票记录需要清理' };
    }

    const groupedVotes = {};

    // 2. 按 openid 和 matchId 分组
    votes.data.forEach(vote => {
      const key = `${vote._openid}-${vote.matchId}`;
      if (!groupedVotes[key]) {
        groupedVotes[key] = [];
      }
      groupedVotes[key].push(vote);
    });

    // 3. 删除重复投票 (保留最早的一条)
    let deletedCount = 0;
    for (const key in groupedVotes) {
      if (groupedVotes[key].length > 1) {
        // 按投票时间升序排序
        groupedVotes[key].sort((a, b) => new Date(a.voteTime).getTime() - new Date(b.voteTime).getTime());

        // 保留第一条，删除后面的
        const votesToDelete = groupedVotes[key].slice(1);

        for (const vote of votesToDelete) {
          try {
            await db.collection(collectionName).doc(vote._id).remove();
            deletedCount++;
          } catch (deleteError) {
            console.error(`删除投票记录失败 (ID: ${vote._id})`, deleteError);
          }
        }
      }
    }

    console.log(`清理完成，共删除 ${deletedCount} 条重复投票记录`);
    return { success: true, deletedCount: deletedCount };

  } catch (error) {
    console.error('清理投票记录失败：', error);
    return { success: false, error: error.message || '未知错误' };
  }
};
