Page({
  data: {
    
  },
  
  navigateToTengfei() {
    wx.navigateTo({
      url: '/pages/tengfei/index'
    })
  },

  onShareAppMessage: function () {
    return {
      title: '珞珈竞赛',
      path: '/pages/index/index?from=share&page=index',
      imageUrl: '/images/icons/logo.png'
    }
  },

  onShareTimeline: function () {
    return {
      title: '珞珈竞赛',
      query: 'from=timeline&page=index',
      imageUrl: '/images/icons/logo.png'
    }
  }
}) 