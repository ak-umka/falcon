const endpoint=process.env.STUDIO_URL;
const token=process.env.PRODUCTION_RUNNER_TOKEN;
if(!endpoint||!token||new URL(endpoint).protocol!=='https:')throw new Error('Set HTTPS STUDIO_URL and PRODUCTION_RUNNER_TOKEN');
let stopped=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true});
while(!stopped){
 try{const response=await fetch(new URL('/api/internal/production',endpoint),{method:'POST',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(270000)});if(!response.ok)console.error(`Production runner HTTP ${response.status}`);else console.log(JSON.stringify({at:new Date().toISOString(),...await response.json()}));}
 catch{console.error('Production runner request failed; server lease prevents overlapping execution.');}
 if(!stopped)await new Promise(resolve=>setTimeout(resolve,15000));
}
