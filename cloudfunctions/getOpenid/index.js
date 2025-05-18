// cloudfunctions/getOpenid/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    console.log('wxContext:', wxContext) // 添加日志

    if (!wxContext) {
      console.error('wxContext为空')
      return {
        success: false,
        error: '无法获取微信上下文'
      }
    }

    if (!wxContext.OPENID) {
      console.error('OPENID为空')
      return {
        success: false,
        error: '获取用户openid失败'
      }
    }

    console.log('成功获取用户信息：', {
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID
    })

    return {
      success: true,
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID
    }
  } catch (error) {
    console.error('云函数错误：', error)
    return {
      success: false,
      error: error.message || '未知错误'
    }
  }
}