/** 云函数：challonge
 * event: { slug: '2025tengfeibei', resource: 'matches'|'participants'|'full' }
 */
const axios = require('axios')

exports.main = async (event) => {
  const { slug = '2025tengfeibei', resource = 'full' } = event
  const apiKey = process.env.CHALLONGE_API_KEY

  // 1. 组装 URL
  let path = ''
  if (resource === 'matches')      path = '/matches'
  if (resource === 'participants') path = '/participants'
  const url = `https://api.challonge.com/v1/tournaments/${slug}${path}.json`

  // 2. 调用 API
  try {
    const { data } = await axios.get(url, { params: { api_key: apiKey } })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, msg: e.response?.data || e.message }
  }
}
