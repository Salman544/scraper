import got from 'got'
import { decryptSnapSave, getRenderedSnapSaveUrl } from '../utils/index.js'
import cheerio from 'cheerio'
import { SnapSaveArgsSchema, SnapSaveSchema, SnapSave } from '../types/index.js'

export default async function snapsave (url: string, agent: HttpsProxyAgent): Promise<SnapSave[]> {
  SnapSaveArgsSchema.parse(arguments)

  const html = await got.post('https://snapsave.app/action.php?lang=id', {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'content-type': 'application/x-www-form-urlencoded',
      // cookie: '_ga=GA1.2.430081394.1657026583; _gid=GA1.2.706849190.1657026583; __gads=ID=86a4700f8371f585-22080b020ad500b0:T=1657026585:RT=1657026585:S=ALNI_MZqzufYDUPXIvFcKgvBGvKGiy2nrA; __gpi=UID=0000076594a4f960:T=1657026585:RT=1657073498:S=ALNI_MbSZmiRZ8YVCA8B07uFu3ZQ1W2lRQ; _gat=1; __atuvc=6%7C27; __atuvs=62c4ef5ab60b5289001',
      origin: 'https://snapsave.app',
      referer: 'https://snapsave.app/id',
      agent: agent,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
    },
    form: { url }
  }).text()

  const decode = decryptSnapSave(html)
  const $ = cheerio.load(decode)

  // console.debug($.html())

  const results: (SnapSave & { shouldRender?: boolean })[] = []

  if ($('table.table').length || $('article.media > figure').length) {
    const thumbnail = $('article.media > figure').find('img').attr('src')
    $('tbody > tr').each((_, el) => {
      const $el = $(el)
      const $td = $el.find('td')
      const resolution = $td.eq(0).text()
      let _url = $td.eq(2).find('a').attr('href') || $td.eq(2).find('button').attr('onclick')
      const shouldRender = /get_progressApi/ig.test(_url || '')
      if (shouldRender) {
        _url = /get_progressApi\('(.*?)'\)/.exec(_url || '')?.[1] || _url
      }
      results.push({
        resolution,
        thumbnail,
        url: _url!,
        shouldRender
      })
    })
  } else {
    const thumbnail = $('div.download-items__thumb > img').attr('src')!
    let _url = $('div.download-items__btn > a').attr('href')!
    if (!/https?:\/\//.test(_url || '')) _url = `https://snapsave.app${_url}`
    results.push({
      thumbnail,
      url: _url
    })
  }

  await Promise.all(results.map(async (result, i) => {
    if (result.shouldRender) {
      let url = result.url
      if (!/^https?/.test(url)) url = `https://snapsave.app${url}`
      const renderedUrl = await getRenderedSnapSaveUrl(url)
      delete result.shouldRender
      result.filesize = renderedUrl.file_size
      result.url = renderedUrl.file_path
      results[i] = result
    }
    return result
  }))

  if (results.length === 0) throw new Error(`No results found\n\n${decode}`)

  return results.map(result => SnapSaveSchema.parse(result))
}
