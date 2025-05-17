// pages/bracketSvg/bracketSvg.js
Page({
  data:{ svgSource:'' },
  onLoad() {
    // 如果你在云函数里拿到了 svgText
    wx.cloud.callFunction({
      name:'getBracketSvg',
      data:{ slug:'2025tengfeibei' },
      success: ({result})=>{
        this.setData({ svgSource: result.svg })
      }
    })
  }
})
