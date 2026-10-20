import type { Metadata } from "next";import "./globals.css";import "./studio-interactive.css";import "./studio-production.css";import "./studio-radar.css";
export const metadata:Metadata={title:"Falcon News Studio — Студия новостей",description:"Ваш ведущий. Ваш голос. Ваши новости. Создание и публикация видео с AI-аватаром.",icons:{icon:"/favicon.svg"}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
