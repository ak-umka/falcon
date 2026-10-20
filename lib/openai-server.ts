import { AppError } from "./server";
import { providerFetch } from "./ai-server";
import { generatedScriptSchema,scriptMessages,type ScriptBrief } from "./script-generator";
import { responseText } from "./openai-contract";
export async function writeOpenAIScript(brief:ScriptBrief,key:string){
  const response=await providerFetch("openai","https://api.openai.com/v1/responses",key,{
    model:brief.model,input:scriptMessages(brief),text:{format:{type:"json_object"}},max_output_tokens:6000,store:false,
  });
  const data:any=await response.json().catch(()=>null);
  try{const value=JSON.parse(responseText(data)),parsed=generatedScriptSchema.safeParse(value);
    if(!parsed.success)throw new Error("OpenAI вернул сценарий с неверной структурой или длиной.");
    return parsed.data;
  }catch(e){throw new AppError(`${e instanceof Error?e.message:"Некорректный сценарий OpenAI."} Выпуск не создан; запрос мог быть оплачен.`,502,"invalid_output");}
}
