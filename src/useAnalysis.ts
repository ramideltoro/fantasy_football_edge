import {useEffect,useState} from 'react';
let value:any=null, readAt=0, pending:Promise<any>|null=null;
export async function readAnalysis(){if(value&&Date.now()-readAt<4500)return value;if(!pending)pending=fetch('/api/intelligence').then(async r=>{if(!r.ok)throw Error('Analysis unavailable');value=await r.json();readAt=Date.now();return value}).finally(()=>{pending=null});return pending;}
export function useAnalysis(){const [d,setD]=useState<any>(value);useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;async function poll(){try{const next=await readAnalysis();if(!stopped)setD(next)}catch{}finally{if(!stopped)timer=setTimeout(poll,5000)}}void poll();return()=>{stopped=true;clearTimeout(timer)}},[]);return d;}
