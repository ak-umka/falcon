import { AsyncLocalStorage } from "node:async_hooks";
const owners=new AsyncLocalStorage<string>();
export const productionOwner=()=>owners.getStore();
export function withProductionOwner<T>(owner:string,fn:()=>Promise<T>){return owners.run(owner,fn);}
