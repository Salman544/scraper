import got from 'got'
import vm from 'vm'
import { SaveFromArgsSchema, Savefrom, SaveFromSchema } from '../types/index.js'
import { generateSavefromParams } from '../utils/savefrom.js'

export default async function savefrom (url: string): Promise<Savefrom[]> {
  SaveFromArgsSchema.parse(arguments)

  let scriptJS = await got('https://worker.savefrom.net/savefrom.php', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://id.savefrom.net',
      referer: 'https://id.savefrom.net/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.74 Safari/537.36'
    },
    form: {
      sf_url: encodeURI(url),
      sf_submit: '',
      new: 2,
      lang: 'id',
      app: '',
      country: 'id',
      os: 'Windows',
      browser: 'Chrome',
      channel: 'main',
      'sf-nomad': 1,
      url,
      ...generateSavefromParams(url)
    }
  }).text()
  const executeCode = '[]["filter"]["constructor"](b).call(a);'
  if (scriptJS.indexOf(executeCode) === -1) throw new Error(`Cannot find executable code\n${scriptJS}`)
  scriptJS = scriptJS.replace(executeCode, `
try {const script = ${executeCode.split('.call')[0]}.toString();if (script.includes('function showResult')) scriptResult = script;else (${executeCode.replace(/;/, '')});} catch {}
`)
  const context = {
    scriptResult: '',
    log: console.log
  }
  vm.createContext(context)
  new vm.Script(scriptJS).runInContext(context)
  const data = context.scriptResult.split('window.parent.sf.videoResult.show(')?.[1] || context.scriptResult.split('window.parent.sf.videoResult.showRows(')?.[1]
  if (!data) throw new Error(`Cannot find data ("${data}") from\n"${context.scriptResult}"`)
  let json: Savefrom[] | null
  try {
    // @ts-ignore
    if (context.scriptResult.includes('showRows')) {
      const splits = data.split('],"')
      const lastIndex = splits.findIndex(v => v.includes('window.parent.sf.enableElement'))
      json = JSON.parse(splits.slice(0, lastIndex).join('],"') + ']')
    } else {
      json = [JSON.parse(data.split(');')[0])]
    }
  } catch (e) {
    console.error(e)
  }
  if (!json! || !json.length) throw new Error(`Cannot parse data ("${data}") from\n"${context.scriptResult}"`)
  return json.map(v => SaveFromSchema.parse(v))
}
