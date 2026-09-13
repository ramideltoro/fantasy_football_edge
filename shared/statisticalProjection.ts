import { scoreRow } from './playerForecast.ts';
export const projectionMethod = 'statistics-v1';
// Deliberately conservative: specialist scoring needs verified event-level mappings.
export function statisticalProjection(p: any, input: any) {
  const empty = (reason: string) => ({ id:p.id, points:null, low:null, high:null, reason, method:projectionMethod });
  if (p.bye === input.week || ['O','IR','PUP','SUSP'].includes(p.injury))
    return {id:p.id,points:0,low:0,high:0,reason:'Imported bye or unavailable designation; verify current status.',method:projectionMethod};
  if (!['QB','RB','WR','TE'].includes(p.position)) return empty('Specialist scoring is not yet verified; Yahoo fallback retained.');
  const history = (p.history || []).filter((r:any)=>Number(r.season) === input.season && Number(r.week)<input.week)
    .sort((a:any,b:any)=>Number(b.week)-Number(a.week)).slice(0,6);
  if (history.length<3) return empty('At least three prior current-season games are required; prior-season performance is context only.');
  const values = history.map((r:any)=>scoreRow(r,input.scoring));
  if (values.some((n:any)=>n===null || !Number.isFinite(n))) return empty('League scoring could not be verified.');
  const weights = values.map((_:any,i:number)=>Math.pow(0.8,i));
  const total = weights.reduce((a:number,b:number)=>a+b,0);
  const mean = values.reduce((n:number,v:number,i:number)=>n+v*weights[i],0)/total;
  const spread = Math.sqrt(values.reduce((n:number,v:number,i:number)=>n+weights[i]*(v-mean)**2,0)/total);
  const round=(n:number)=>Math.round(n*100)/100;
  return {id:p.id,points:round(mean),low:round(mean-spread),high:round(mean+spread),method:projectionMethod,
    reason:`Recency-weighted scoring from ${history.length} prior current-season games using league rules. Range shows historical variability, not a confidence interval. No unsupported news, weather or matchup adjustment.`};
}
