export let debug = true

const ts = () => {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}

export const log = (...args: unknown[]) => {
  if(args[0].startsWith('[draw')) {
    return
  }
  
  if (debug) console.log(ts(), ...args) }
