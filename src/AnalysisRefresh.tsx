import {readAnalysis} from "./useAnalysis";
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {ImportOperations} from './ImportOperations';
export function AnalysisRefresh({owner,snapshotAt}:{owner:boolean;snapshotAt:string}){
 const [state,setState]=useState<any>(null),[logs,setLogs]=useState<any[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;async function poll(){try{const data=await readAnalysis();if(!stopped)setState(data);if(owner){const p=await fetch('/api/ai/progress');if(p.ok&&!stopped)setLogs((await p.json()).logs)}}catch{if(!stopped)setNotice('Status connection lost; previous information remains visible.')}finally{if(!stopped)timer=setTimeout(poll,5000)}}void poll();return()=>{stopped=true;clearTimeout(timer)}},[owner]);
 const running=['queued','building','ready','analyzing'].includes(state?.status);
 const last=state?.data?.qwen?.generatedAt||state?.previousQwen?.generatedAt;
 return <section className="panel"><div className="ai-heading"><h3>Recommendation updates</h3><button aria-label="Refresh Yahoo and recommendations" disabled={!owner||busy} onClick={async()=>{setBusy(true);try{const r=await fetch('/api/import/request',{method:'POST'});if(!r.ok)throw Error();const a=await fetch('/api/intelligence/retry',{method:'POST'});if(!a.ok)throw Error();setNotice('Refresh requested. Yahoo import and Qwen analysis progress appear below.')}catch{setNotice('Refresh could not be fully queued. Check worker logs and sign-in.')}finally{setBusy(false)}}}><RefreshCw size={16}/> Refresh</button></div>
 <p>Yahoo data: {new Date(snapshotAt).toLocaleString()} · Last successful Qwen: {last?new Date(last).toLocaleString():'No successful analysis yet'}</p>
 <p role="status">{running?'Updating: ':''}{state?.status||'Loading'} · {state?.qwenUpdated?'Current analysis':'Not updated — previous Qwen suggestions or statistical alternatives shown.'} {notice}</p>
 {logs[0]&&<p>Worker: {logs[0].stage} · {new Date(logs[0].created_at).toLocaleTimeString()}{Date.now()-Date.parse(logs[0].created_at)>120000?' · No heartbeat for over two minutes; Mac may be offline or worker stalled.':''}</p>}
 <details><summary>Live worker activity and Yahoo import logs</summary><p>Heartbeat updates every 15 seconds during analysis. Inference is limited to four minutes; a heartbeat means the process is alive, not that generation has finished.</p>{logs.map(l=><p key={l.id}>{new Date(l.created_at).toLocaleTimeString()} · {l.stage}</p>)}<ImportOperations owner={owner}/></details></section>
}
