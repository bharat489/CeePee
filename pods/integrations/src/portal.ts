//
// Copyright © 2026 Qicky Globaltech Private Limited
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// The public help centre: no login, one page per project that switched its
// portal on (/portal/<slug>) plus the default one from the environment
// (/portal). Search the knowledge base, submit a request of a chosen type,
// follow it by key + email, exchange customer-visible replies with the team,
// see your organisation's other requests, and rate the outcome.

import { type PlatformClient } from '@hcengineering/api-client'
import contact, { formatName } from '@hcengineering/contact'
import { type Class, type Doc, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { IssuePriority, type CustomerOrg, type CustomerReply, type FormField, type Idea, type Issue, type IssueForm, type Project, type RequestType } from '@hcengineering/tracker'

import { addComment, createIssue, findIssue, findProject, personByEmail } from './platform'

export interface PortalConfig {
  name: string
  color: string
  logoUrl: string
  project: string
  publicUrl: string
  /** URL base for links: "/portal" or "/portal/<slug>". */
  base: string
  welcome?: string
  /** Portal language (en, hi, es, fr, de, pt). */
  lang?: string
  /** Rendered inside the collector iframe: no header, footer or language row. */
  embed?: boolean
}

export interface Result {
  status: number
  body: string | Record<string, unknown>
  html?: boolean
}

const DOC_CLASS = 'document:class:Document' as Ref<Class<Doc>>

// ---- languages ------------------------------------------------------------------
export const LANGS: Array<{ id: string, name: string }> = [
  { id: 'en', name: 'English' }, { id: 'hi', name: 'हिन्दी' }, { id: 'es', name: 'Español' }, { id: 'fr', name: 'Français' }, { id: 'de', name: 'Deutsch' }, { id: 'pt', name: 'Português' }
]
const L: Record<string, Record<string, string>> = {
  en: { how: 'How can we help?', search: 'Search help articles…', nomatch: 'No articles match. Send us a request below.', submit: 'Submit a request', submitHint: 'Pick what you need, tell us what happened. You will get a ticket key to check progress.', notConfigured: 'The help centre is not configured yet.', email: 'Your email', name: 'Your name', optional: 'Optional', what: 'What happened', oneLine: 'One line', details: 'Details', detailsPh: 'Steps, what you expected, what you saw', send: 'Send request', check: 'Check a request', key: 'Ticket key', checkStatus: 'Check status', orgRequests: "Your organisation's requests:", show: 'Show', within: 'Response within', needsApproval: 'Needs approval', ideas: 'Ideas', back: 'Back', backHome: 'Back to help centre', status: 'Status', updated: 'updated', due: 'response due', conversation: 'Conversation', noMessages: 'No messages yet. Anything the team writes here will show up for you.', addMessage: 'Add a message', addPh: 'More details, a screenshot link, or a question', sendMsg: 'Send', howDidWeDo: 'How did we do?', thanksRating: 'Thanks for rating this request', sent: 'Request sent', keepLink: 'Keep this link to follow progress and talk to us:', approvalNote: 'This kind of request is approved before work starts; you will see the outcome on the status page.', missing: 'Please give an email and a one-line summary.', notFound: 'No request with that key and email.', mayHelp: 'These articles may answer this already', close: 'Close', powered: 'Powered by CeePee', thankYou: 'Thank you', follow: 'Follow progress and talk to us here:', voteIntro: 'Vote for what you want next. Enter your email once; it is only used to count one vote per person.', useEmail: 'Use this email', noIdeas: 'No public ideas yet.', suggest: 'Suggest an idea', idea: 'Idea', why: 'Why', whyPh: 'What problem would it solve for you?', suggestBtn: 'Suggest', sharedIssue: 'Shared issue', priority: 'Priority', assignee: 'Assignee', labels: 'Labels', noDescription: 'No description.', readOnly: 'Read-only view shared by the team.' },
  hi: { how: 'हम कैसे मदद कर सकते हैं?', search: 'सहायता लेख खोजें…', nomatch: 'कोई लेख नहीं मिला। नीचे अनुरोध भेजें।', submit: 'अनुरोध भेजें', submitHint: 'चुनें कि आपको क्या चाहिए और बताएं क्या हुआ। प्रगति देखने के लिए आपको टिकट कुंजी मिलेगी।', notConfigured: 'सहायता केंद्र अभी सेट नहीं है।', email: 'आपका ईमेल', name: 'आपका नाम', optional: 'वैकल्पिक', what: 'क्या हुआ', oneLine: 'एक पंक्ति में', details: 'विवरण', detailsPh: 'चरण, आपने क्या उम्मीद की, क्या देखा', send: 'अनुरोध भेजें', check: 'अनुरोध की स्थिति', key: 'टिकट कुंजी', checkStatus: 'स्थिति देखें', orgRequests: 'आपके संगठन के अनुरोध:', show: 'दिखाएँ', within: 'जवाब इतने समय में', needsApproval: 'अनुमोदन आवश्यक', ideas: 'विचार', back: 'वापस', backHome: 'सहायता केंद्र पर वापस', status: 'स्थिति', updated: 'अपडेट', due: 'जवाब की समय-सीमा', conversation: 'बातचीत', noMessages: 'अभी कोई संदेश नहीं। टीम जो भी लिखेगी वह यहाँ दिखेगा।', addMessage: 'संदेश जोड़ें', addPh: 'और विवरण, स्क्रीनशॉट लिंक, या सवाल', sendMsg: 'भेजें', howDidWeDo: 'हमने कैसा किया?', thanksRating: 'रेटिंग के लिए धन्यवाद', sent: 'अनुरोध भेजा गया', keepLink: 'प्रगति देखने और हमसे बात करने के लिए यह लिंक रखें:', approvalNote: 'इस तरह के अनुरोध पर काम शुरू होने से पहले अनुमोदन होता है; परिणाम स्थिति पृष्ठ पर दिखेगा।', missing: 'कृपया ईमेल और एक पंक्ति का सारांश दें।', notFound: 'इस कुंजी और ईमेल से कोई अनुरोध नहीं मिला।', mayHelp: 'ये लेख शायद पहले ही जवाब दे दें', close: 'बंद करें', powered: 'CeePee द्वारा संचालित', thankYou: 'धन्यवाद', follow: 'प्रगति देखें और यहाँ हमसे बात करें:', voteIntro: 'जो आप आगे चाहते हैं उसे वोट दें। ईमेल एक बार दें; इसका उपयोग सिर्फ एक व्यक्ति एक वोट गिनने के लिए होता है।', useEmail: 'यह ईमेल उपयोग करें', noIdeas: 'अभी कोई सार्वजनिक विचार नहीं।', suggest: 'विचार सुझाएँ', idea: 'विचार', why: 'क्यों', whyPh: 'यह आपकी कौन सी समस्या हल करेगा?', suggestBtn: 'सुझाएँ', sharedIssue: 'साझा किया गया कार्य', priority: 'प्राथमिकता', assignee: 'ज़िम्मेदार', labels: 'लेबल', noDescription: 'कोई विवरण नहीं।', readOnly: 'टीम द्वारा साझा किया गया केवल-पढ़ने योग्य दृश्य।' },
  es: { how: '¿Cómo podemos ayudarle?', search: 'Buscar artículos de ayuda…', nomatch: 'Ningún artículo coincide. Envíenos una solicitud abajo.', submit: 'Enviar una solicitud', submitHint: 'Elija lo que necesita y cuéntenos qué pasó. Recibirá una clave para seguir el progreso.', notConfigured: 'El centro de ayuda aún no está configurado.', email: 'Su correo', name: 'Su nombre', optional: 'Opcional', what: 'Qué ocurrió', oneLine: 'En una línea', details: 'Detalles', detailsPh: 'Pasos, lo que esperaba, lo que vio', send: 'Enviar solicitud', check: 'Consultar una solicitud', key: 'Clave del ticket', checkStatus: 'Ver estado', orgRequests: 'Solicitudes de su organización:', show: 'Mostrar', within: 'Respuesta en', needsApproval: 'Requiere aprobación', ideas: 'Ideas', back: 'Volver', backHome: 'Volver al centro de ayuda', status: 'Estado', updated: 'actualizado', due: 'respuesta prevista', conversation: 'Conversación', noMessages: 'Aún no hay mensajes. Lo que escriba el equipo aparecerá aquí.', addMessage: 'Añadir un mensaje', addPh: 'Más detalles, un enlace a una captura o una pregunta', sendMsg: 'Enviar', howDidWeDo: '¿Qué tal lo hicimos?', thanksRating: 'Gracias por valorar esta solicitud', sent: 'Solicitud enviada', keepLink: 'Guarde este enlace para seguir el progreso y hablar con nosotros:', approvalNote: 'Este tipo de solicitud se aprueba antes de empezar; verá el resultado en la página de estado.', missing: 'Indique un correo y un resumen de una línea.', notFound: 'No hay ninguna solicitud con esa clave y correo.', mayHelp: 'Estos artículos quizá ya lo respondan', close: 'Cerrar', powered: 'Con tecnología de CeePee', thankYou: 'Gracias', follow: 'Siga el progreso y hable con nosotros aquí:', voteIntro: 'Vote lo que quiere ver a continuación. Indique su correo una vez; solo sirve para contar un voto por persona.', useEmail: 'Usar este correo', noIdeas: 'Aún no hay ideas públicas.', suggest: 'Sugerir una idea', idea: 'Idea', why: 'Por qué', whyPh: '¿Qué problema le resolvería?', suggestBtn: 'Sugerir', sharedIssue: 'Incidencia compartida', priority: 'Prioridad', assignee: 'Responsable', labels: 'Etiquetas', noDescription: 'Sin descripción.', readOnly: 'Vista de solo lectura compartida por el equipo.' },
  fr: { how: 'Comment pouvons-nous aider ?', search: 'Rechercher dans l’aide…', nomatch: 'Aucun article ne correspond. Envoyez-nous une demande ci-dessous.', submit: 'Envoyer une demande', submitHint: 'Choisissez ce dont vous avez besoin et racontez ce qui s’est passé. Vous recevrez une clé pour suivre l’avancement.', notConfigured: 'Le centre d’aide n’est pas encore configuré.', email: 'Votre e-mail', name: 'Votre nom', optional: 'Facultatif', what: 'Que s’est-il passé', oneLine: 'En une ligne', details: 'Détails', detailsPh: 'Étapes, ce que vous attendiez, ce que vous avez vu', send: 'Envoyer la demande', check: 'Suivre une demande', key: 'Clé du ticket', checkStatus: 'Voir le statut', orgRequests: 'Demandes de votre organisation :', show: 'Afficher', within: 'Réponse sous', needsApproval: 'Approbation requise', ideas: 'Idées', back: 'Retour', backHome: 'Retour au centre d’aide', status: 'Statut', updated: 'mis à jour', due: 'réponse attendue', conversation: 'Conversation', noMessages: 'Pas encore de message. Tout ce que l’équipe écrira apparaîtra ici.', addMessage: 'Ajouter un message', addPh: 'Plus de détails, un lien vers une capture, une question', sendMsg: 'Envoyer', howDidWeDo: 'Comment avons-nous fait ?', thanksRating: 'Merci d’avoir noté cette demande', sent: 'Demande envoyée', keepLink: 'Gardez ce lien pour suivre l’avancement et nous parler :', approvalNote: 'Ce type de demande est approuvé avant le début du travail ; le résultat s’affichera sur la page de statut.', missing: 'Indiquez un e-mail et un résumé en une ligne.', notFound: 'Aucune demande avec cette clé et cet e-mail.', mayHelp: 'Ces articles répondent peut-être déjà', close: 'Fermer', powered: 'Propulsé par CeePee', thankYou: 'Merci', follow: 'Suivez l’avancement et parlez-nous ici :', voteIntro: 'Votez pour ce que vous voulez ensuite. Indiquez votre e-mail une fois ; il sert seulement à compter un vote par personne.', useEmail: 'Utiliser cet e-mail', noIdeas: 'Pas encore d’idée publique.', suggest: 'Proposer une idée', idea: 'Idée', why: 'Pourquoi', whyPh: 'Quel problème cela résoudrait-il pour vous ?', suggestBtn: 'Proposer', sharedIssue: 'Ticket partagé', priority: 'Priorité', assignee: 'Assigné à', labels: 'Étiquettes', noDescription: 'Pas de description.', readOnly: 'Vue en lecture seule partagée par l’équipe.' },
  de: { how: 'Wie können wir helfen?', search: 'Hilfeartikel suchen…', nomatch: 'Kein Artikel passt. Senden Sie uns unten eine Anfrage.', submit: 'Anfrage senden', submitHint: 'Wählen Sie, was Sie brauchen, und beschreiben Sie, was passiert ist. Sie erhalten einen Ticket-Schlüssel zum Verfolgen.', notConfigured: 'Das Hilfecenter ist noch nicht eingerichtet.', email: 'Ihre E-Mail', name: 'Ihr Name', optional: 'Optional', what: 'Was ist passiert', oneLine: 'In einer Zeile', details: 'Details', detailsPh: 'Schritte, was Sie erwartet haben, was Sie gesehen haben', send: 'Anfrage senden', check: 'Anfrage prüfen', key: 'Ticket-Schlüssel', checkStatus: 'Status prüfen', orgRequests: 'Anfragen Ihrer Organisation:', show: 'Anzeigen', within: 'Antwort innerhalb', needsApproval: 'Genehmigung nötig', ideas: 'Ideen', back: 'Zurück', backHome: 'Zurück zum Hilfecenter', status: 'Status', updated: 'aktualisiert', due: 'Antwort fällig', conversation: 'Unterhaltung', noMessages: 'Noch keine Nachrichten. Alles, was das Team hier schreibt, sehen Sie hier.', addMessage: 'Nachricht hinzufügen', addPh: 'Mehr Details, ein Screenshot-Link oder eine Frage', sendMsg: 'Senden', howDidWeDo: 'Wie war unsere Hilfe?', thanksRating: 'Danke für Ihre Bewertung', sent: 'Anfrage gesendet', keepLink: 'Behalten Sie diesen Link, um den Fortschritt zu verfolgen und mit uns zu sprechen:', approvalNote: 'Diese Art von Anfrage wird vor Arbeitsbeginn genehmigt; das Ergebnis sehen Sie auf der Statusseite.', missing: 'Bitte E-Mail und eine einzeilige Zusammenfassung angeben.', notFound: 'Keine Anfrage mit diesem Schlüssel und dieser E-Mail.', mayHelp: 'Diese Artikel beantworten das vielleicht schon', close: 'Schließen', powered: 'Bereitgestellt von CeePee', thankYou: 'Danke', follow: 'Fortschritt verfolgen und mit uns sprechen:', voteIntro: 'Stimmen Sie ab, was als Nächstes kommen soll. E-Mail einmal eingeben; sie dient nur dazu, eine Stimme pro Person zu zählen.', useEmail: 'Diese E-Mail verwenden', noIdeas: 'Noch keine öffentlichen Ideen.', suggest: 'Idee vorschlagen', idea: 'Idee', why: 'Warum', whyPh: 'Welches Problem würde das für Sie lösen?', suggestBtn: 'Vorschlagen', sharedIssue: 'Geteilter Vorgang', priority: 'Priorität', assignee: 'Zuständig', labels: 'Labels', noDescription: 'Keine Beschreibung.', readOnly: 'Vom Team geteilte, schreibgeschützte Ansicht.' },
  pt: { how: 'Como podemos ajudar?', search: 'Pesquisar artigos de ajuda…', nomatch: 'Nenhum artigo corresponde. Envie-nos um pedido abaixo.', submit: 'Enviar um pedido', submitHint: 'Escolha o que precisa e conte o que aconteceu. Receberá uma chave para acompanhar o progresso.', notConfigured: 'O centro de ajuda ainda não está configurado.', email: 'O seu e-mail', name: 'O seu nome', optional: 'Opcional', what: 'O que aconteceu', oneLine: 'Numa linha', details: 'Detalhes', detailsPh: 'Passos, o que esperava, o que viu', send: 'Enviar pedido', check: 'Consultar um pedido', key: 'Chave do ticket', checkStatus: 'Ver estado', orgRequests: 'Pedidos da sua organização:', show: 'Mostrar', within: 'Resposta em', needsApproval: 'Precisa de aprovação', ideas: 'Ideias', back: 'Voltar', backHome: 'Voltar ao centro de ajuda', status: 'Estado', updated: 'atualizado', due: 'resposta prevista', conversation: 'Conversa', noMessages: 'Ainda sem mensagens. O que a equipa escrever aparecerá aqui.', addMessage: 'Adicionar mensagem', addPh: 'Mais detalhes, um link de captura de ecrã ou uma pergunta', sendMsg: 'Enviar', howDidWeDo: 'Como nos saímos?', thanksRating: 'Obrigado por avaliar este pedido', sent: 'Pedido enviado', keepLink: 'Guarde este link para acompanhar o progresso e falar connosco:', approvalNote: 'Este tipo de pedido é aprovado antes de começar; verá o resultado na página de estado.', missing: 'Indique um e-mail e um resumo numa linha.', notFound: 'Nenhum pedido com essa chave e e-mail.', mayHelp: 'Estes artigos talvez já respondam', close: 'Fechar', powered: 'Com tecnologia CeePee', thankYou: 'Obrigado', follow: 'Acompanhe o progresso e fale connosco aqui:', voteIntro: 'Vote no que quer a seguir. Indique o e-mail uma vez; serve apenas para contar um voto por pessoa.', useEmail: 'Usar este e-mail', noIdeas: 'Ainda não há ideias públicas.', suggest: 'Sugerir uma ideia', idea: 'Ideia', why: 'Porquê', whyPh: 'Que problema resolveria para si?', suggestBtn: 'Sugerir', sharedIssue: 'Issue partilhada', priority: 'Prioridade', assignee: 'Responsável', labels: 'Etiquetas', noDescription: 'Sem descrição.', readOnly: 'Vista só de leitura partilhada pela equipa.' }
}
export const t = (cfg: PortalConfig, key: string): string => L[cfg.lang ?? 'en']?.[key] ?? L.en[key] ?? key
export const pickLang = (...candidates: Array<string | undefined | null>): string => {
  for (const c of candidates) {
    const id = (c ?? '').toLowerCase().slice(0, 2)
    if (id !== '' && LANGS.some((l) => l.id === id)) return id
  }
  return 'en'
}

/** Inline script: article suggestions while typing a title, and the collector's close hook. */
function tail (cfg: PortalConfig): string {
  const close = cfg.embed === true
    ? "document.querySelectorAll('a.btn').forEach(function(a){if(a.getAttribute('href')===b){a.textContent=" + JSON.stringify(t(cfg, 'close')) + ";a.addEventListener('click',function(e){e.preventDefault();parent.postMessage('ceepee-collector-close','*')})}});"
    : ''
  const escTitle = "String(a.title).replace(/[<>&]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c]})"
  return '<script>(function(){var b=' + JSON.stringify(cfg.base) + ',h=' + JSON.stringify(t(cfg, 'mayHelp')) +
    ";var i=document.querySelector('input[name=title],input[data-kb]');if(i){var box=document.createElement('div');box.className='sugg';i.insertAdjacentElement('afterend',box);var tm;i.addEventListener('input',function(){clearTimeout(tm);var q=i.value.trim();if(q.length<3){box.innerHTML='';return}tm=setTimeout(function(){fetch(b+'/kb?q='+encodeURIComponent(q),{headers:{accept:'application/json'}}).then(function(r){return r.json()}).then(function(j){var r=(j&&j.results)||[];box.innerHTML=r.length?'<div class=\"m\">'+h+'</div><ul class=\"kb\">'+r.slice(0,5).map(function(a){return '<li><a target=\"_blank\" href=\"'+b+'/article/'+encodeURIComponent(a._id)+'\">'+" + escTitle + "+'</a></li>'}).join('')+'</ul>':''}).catch(function(){})},350)})}" +
    close + '})();</script>'
}
function esc (s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

/** The portal for a slug: '' = the environment's default project; otherwise a project whose portal is enabled. */
export async function resolvePortal (c: PlatformClient, env: PortalConfig, slug: string): Promise<PortalConfig | undefined> {
  if (slug === '') return env.project !== '' ? { ...env, base: '/portal' } : { ...env, base: '/portal' }
  const projects = await c.findAll(tracker.class.Project, { archived: false })
  const p = Array.from(projects).find((x) => x.portal?.enabled === true && x.portal.slug === slug)
  if (p === undefined || p.portal === undefined) return undefined
  return { name: p.portal.name || p.name, color: p.portal.color || env.color, logoUrl: p.portal.logoUrl ?? '', project: p.identifier, publicUrl: env.publicUrl, base: `/portal/${slug}`, welcome: p.portal.welcome }
}

export function page (cfg: PortalConfig, title: string, body: string): string {
  return `<!doctype html><html lang="${esc(cfg.lang ?? 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(cfg.name)}</title>
<style>
:root{--c:${esc(cfg.color)};--bg:#f6f7f9;--ink:#15171c;--mut:#6b7280;--line:#e5e7eb}
@media(prefers-color-scheme:dark){:root{--bg:#0e0f10;--ink:#f3f4f6;--mut:#9ca3af;--line:#2a2d33}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--c);color:#fff;padding:1.4rem 1.2rem}header .in{max-width:56rem;margin:0 auto;display:flex;align-items:center;gap:.8rem}
header img{height:2rem}header h1{font-size:1.25rem;margin:0}header a{color:#fff;text-decoration:none}
main{max-width:56rem;margin:0 auto;padding:1.5rem 1.2rem}
.card{background:#fff;border:1px solid var(--line);border-radius:.9rem;padding:1.2rem;margin:0 0 1rem}@media(prefers-color-scheme:dark){.card{background:#15171c}}
h2{margin:0 0 .6rem;font-size:1.05rem}p.m{color:var(--mut);margin:.2rem 0 .8rem;font-size:.9rem}
input,textarea,select{width:100%;padding:.6rem .7rem;border:1px solid var(--line);border-radius:.55rem;font:inherit;background:transparent;color:inherit}
label{display:block;font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);margin:.7rem 0 .25rem}
button,.btn{display:inline-block;padding:.6rem 1.1rem;border:0;border-radius:.6rem;background:var(--c);color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.types{display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.6rem}.type{border:1px solid var(--line);border-radius:.7rem;padding:.7rem .8rem;cursor:pointer}.type.on{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}
.type b{display:block}.type span{font-size:.8rem;color:var(--mut)}
ul.kb{list-style:none;margin:0;padding:0}ul.kb li{padding:.5rem 0;border-top:1px solid var(--line)}ul.kb a{color:var(--c);text-decoration:none;font-weight:600}
.pill{display:inline-block;padding:.1rem .55rem;border-radius:999px;background:color-mix(in srgb,var(--c) 15%,transparent);color:var(--c);font-size:.75rem;font-weight:600}
.stars button{background:none;color:#f5a623;font-size:1.6rem;padding:0 .1rem}
.msg{padding:.6rem .8rem;border-radius:.6rem;background:color-mix(in srgb,var(--mut) 12%,transparent);margin:.4rem 0}.msg.me{background:color-mix(in srgb,var(--c) 12%,transparent)}.msg small{display:block;color:var(--mut);font-size:.75rem;margin-bottom:.15rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{padding:.45rem .4rem;border-top:1px solid var(--line);text-align:left}th{color:var(--mut);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
footer{color:var(--mut);font-size:.75rem;text-align:center;padding:1rem}
article{line-height:1.7}article img{max-width:100%}
.sugg .m{margin:.5rem 0 .2rem;font-size:.8rem;color:var(--mut)}.sugg ul.kb li{padding:.3rem 0}.langs a{color:var(--mut);text-decoration:none;margin:0 .25rem}.langs a:hover{color:var(--c)}
${cfg.embed === true ? 'header,footer{display:none}main{padding:.6rem .8rem}' : ''}
</style></head><body><header><div class="in">${cfg.logoUrl !== '' ? `<img src="${esc(cfg.logoUrl)}" alt="">` : ''}<h1><a href="${cfg.base}">${esc(cfg.name)}</a></h1></div></header><main>${body}</main><footer>${t(cfg, 'powered')}<div class="langs">${LANGS.map((l) => `<a href="${cfg.base}?lang=${l.id}"${(cfg.lang ?? 'en') === l.id ? ' style="font-weight:700;color:var(--c)"' : ''}>${l.name}</a>`).join(' · ')}</div></footer>${tail(cfg)}</body></html>`
}

export async function portalHome (c: PlatformClient, cfg: PortalConfig, q: string): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  const types: RequestType[] = project !== undefined ? Array.from(await c.findAll(tracker.class.RequestType, { space: project._id })) : []
  const kb = q.trim() !== '' ? await searchKb(c, q) : []
  const T = (k: string): string => esc(t(cfg, k))
  const body = `
${cfg.welcome !== undefined && cfg.welcome !== '' ? `<div class="card"><p style="margin:0">${esc(cfg.welcome)}</p></div>` : ''}
<div class="card"><h2>${T('how')}</h2>
<form method="get" action="${cfg.base}"><input name="q" value="${esc(q)}" placeholder="${T('search')}"></form>
${kb.length > 0 ? `<ul class="kb">${kb.map((a) => `<li><a href="${cfg.base}/article/${esc(a._id)}">${esc(a.title)}</a></li>`).join('')}</ul>` : q.trim() !== '' ? `<p class="m">${T('nomatch')}</p>` : ''}
</div>
<div class="card"><h2>${T('submit')}</h2><p class="m">${T('submitHint')}</p>
${project === undefined ? `<p class="m">${T('notConfigured')}</p>` : `
<form method="post" action="${cfg.base}/submit" id="f">
<div class="types">${types.map((ty, i) => `<label class="type${i === 0 ? ' on' : ''}" onclick="document.querySelectorAll('.type').forEach(e=>e.classList.remove('on'));this.classList.add('on')"><input type="radio" name="type" value="${esc(ty._id)}" ${i === 0 ? 'checked' : ''} style="display:none"><b>${esc(ty.name)}</b><span>${esc(ty.description)}</span>${ty.slaHours !== undefined && ty.slaHours > 0 ? `<span>${T('within')} ${ty.slaHours}h</span>` : ''}${ty.requiresApproval === true ? `<span>${T('needsApproval')}</span>` : ''}</label>`).join('')}</div>
<label>${T('email')}</label><input name="email" type="email" required placeholder="you@company.com">
<label>${T('name')}</label><input name="name" placeholder="${T('optional')}">
<label>${T('what')}</label><input name="title" required placeholder="${T('oneLine')}">
<label>${T('details')}</label><textarea name="details" rows="6" placeholder="${T('detailsPh')}"></textarea>
<p></p><button type="submit">${T('send')}</button>
</form>`}
</div>
<div class="card"><h2>${T('check')}</h2><form method="get" action="${cfg.base}/status"><label>${T('key')}</label><input name="key" placeholder="${esc(project?.identifier ?? 'KEY')}-12"><label>${T('email')}</label><input name="email" type="email"><p></p><button type="submit">${T('checkStatus')}</button></form>
<p class="m">${T('orgRequests')} <form method="get" action="${cfg.base}/org" style="display:inline"><input name="email" type="email" placeholder="you@company.com" style="width:14rem;display:inline-block"> <button type="submit">${T('show')}</button></form></p>
<p class="m"><a class="btn" href="${cfg.base}/ideas">${T('ideas')} →</a></p></div>`
  return { status: 200, body: page(cfg, cfg.name, body), html: true }
}

async function searchKb (c: PlatformClient, q: string): Promise<Array<{ _id: Ref<Doc>, title: string }>> {
  const words = q.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 3).slice(0, 4)
  const found = new Map<Ref<Doc>, { _id: Ref<Doc>, title: string }>()
  for (const w of words.length > 0 ? words : [q.trim()]) {
    try {
      const docs = await c.findAll(DOC_CLASS, { title: { $like: `%${w}%` } } as any, { limit: 8 })
      for (const d of docs) found.set(d._id, { _id: d._id, title: String((d as any).title ?? '') })
    } catch {
      // documents plugin may be absent
    }
  }
  return Array.from(found.values()).slice(0, 10)
}

export async function portalKb (c: PlatformClient, q: string): Promise<Result> {
  return { status: 200, body: { results: await searchKb(c, q) } }
}

export async function portalArticle (c: PlatformClient, cfg: PortalConfig, id: string): Promise<Result> {
  const doc = (await c.findAll(DOC_CLASS, { _id: id as Ref<Doc> } as any, { limit: 1 }))[0] as any
  if (doc === undefined) return { status: 404, body: page(cfg, 'Not found', '<div class="card"><h2>Article not found</h2></div>'), html: true }
  let html = ''
  try {
    html = doc.content != null ? await c.fetchMarkup(DOC_CLASS, doc._id, 'content', doc.content, 'html') : ''
  } catch {
    html = '<p>This article cannot be displayed.</p>'
  }
  return { status: 200, body: page(cfg, String(doc.title ?? ''), `<div class="card"><h2>${esc(doc.title)}</h2><article>${html}</article></div><p><a class="btn" href="${cfg.base}">← ${esc(cfg.name)}</a></p>`), html: true }
}

async function orgFor (c: PlatformClient, project: Project, email: string): Promise<CustomerOrg | undefined> {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (domain === '') return undefined
  const orgs = await c.findAll(tracker.class.CustomerOrg, { space: project._id })
  return Array.from(orgs).find((o) => o.domains.map((d) => d.toLowerCase()).includes(domain))
}

export async function portalSubmit (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const email = String(o.email ?? '').trim().toLowerCase()
  const title = String(o.title ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || title === '') {
    return wantsHtml ? { status: 400, body: page(cfg, t(cfg, 'missing'), `<div class="card"><h2>${esc(t(cfg, 'missing'))}</h2><p><a class="btn" href="${cfg.base}">${esc(t(cfg, 'back'))}</a></p></div>`), html: true } : { status: 400, body: { error: 'email and title are required' } }
  }
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  if (project === undefined) return { status: 503, body: { error: 'portal project not configured' } }
  const typeId = String(o.type ?? '')
  const type = typeId !== '' ? (await c.findAll(tracker.class.RequestType, { _id: typeId as Ref<RequestType> }, { limit: 1 }))[0] : undefined
  const name = String(o.name ?? '').trim()
  const org = await orgFor(c, project, email)
  const issue = await createIssue(c, project, {
    title,
    description: `From: ${name !== '' ? `${name} <${email}>` : email}${org !== undefined ? ` (${org.name})` : ''}\n\n${String(o.details ?? '')}`,
    priority: type?.priority ?? IssuePriority.Medium,
    assignee: null,
    requestType: true,
    portalEmail: email,
    requestTypeId: type?._id,
    customerOrg: org?._id
  })
  const statusUrl = `${cfg.publicUrl.replace(/\/$/, '')}${cfg.base}/status?key=${encodeURIComponent(issue.identifier)}&email=${encodeURIComponent(email)}`
  if (wantsHtml) {
    const T2 = (k: string): string => esc(t(cfg, k))
    return { status: 200, body: page(cfg, t(cfg, 'sent'), `<div class="card"><h2>${T2('sent')} <span class="pill">${esc(issue.identifier)}</span></h2><p class="m">${T2('keepLink')} <a href="${esc(statusUrl)}">${esc(statusUrl)}</a></p>${type?.requiresApproval === true ? `<p class="m">${T2('approvalNote')}</p>` : ''}<p><a class="btn" href="${cfg.base}">${T2('backHome')}</a></p></div>`), html: true }
  }
  return { status: 200, body: { created: issue.identifier, status: statusUrl } }
}

async function requestFor (c: PlatformClient, key: string, email: string): Promise<Issue | undefined> {
  const issue = await findIssue(c, key)
  if (issue === undefined) return undefined
  return (issue.portalEmail ?? '').toLowerCase() === email.trim().toLowerCase() ? issue : undefined
}

async function statusLabel (c: PlatformClient, issue: Issue): Promise<{ name: string, done: boolean }> {
  const st = (await c.findAll(tracker.class.IssueStatus, { _id: issue.status }, { limit: 1 }))[0]
  return { name: st?.name ?? '', done: st !== undefined && (st.category === task.statusCategory.Won || st.category === task.statusCategory.Lost) }
}

export async function portalStatus (c: PlatformClient, cfg: PortalConfig, key: string, email: string, wantsHtml: boolean): Promise<Result> {
  const T = (k: string): string => esc(t(cfg, k))
  const issue = await requestFor(c, key, email)
  if (issue === undefined) {
    return wantsHtml ? { status: 404, body: page(cfg, t(cfg, 'notFound'), `<div class="card"><h2>${T('notFound')}</h2><p><a class="btn" href="${cfg.base}">${T('back')}</a></p></div>`), html: true } : { status: 404, body: { error: 'not found' } }
  }
  const { name: status, done } = await statusLabel(c, issue)
  const replies: CustomerReply[] = Array.from(await c.findAll(tracker.class.CustomerReply, { attachedTo: issue._id }, { sort: { at: 1 as any } }))
  const approval = issue.approval !== undefined ? issue.approval.state : undefined
  const info = { key: issue.identifier, title: issue.title, status, done, approval, rated: issue.csat !== undefined, updated: issue.modifiedOn, slaDue: issue.slaDue ?? null, replies: replies.map((r) => ({ at: r.at, fromCustomer: r.fromCustomer, author: r.author, text: r.text })) }
  if (!wantsHtml) return { status: 200, body: info }
  const hidden = `<input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="email" value="${esc(email)}">`
  const stars = [1, 2, 3, 4, 5].map((v) => `<form method="post" action="${cfg.base}/rate" style="display:inline">${hidden}<input type="hidden" name="score" value="${v}"><button title="${v} of 5">★</button></form>`).join('')
  const conv = replies.map((r) => `<div class="msg${r.fromCustomer ? ' me' : ''}"><small>${esc(r.fromCustomer ? 'You' : r.author || 'Support')} · ${new Date(r.at).toLocaleString()}</small>${esc(r.text)}</div>`).join('')
  return {
    status: 200,
    body: page(cfg, issue.identifier, `<div class="card"><h2><span class="pill">${esc(issue.identifier)}</span> ${esc(issue.title)}</h2><p class="m">${T('status')}: <b>${esc(status)}</b>${approval !== undefined ? ` · ${esc(approval)}` : ''} · ${T('updated')} ${new Date(issue.modifiedOn).toLocaleString()}${issue.slaDue != null && !done ? ` · ${T('due')} ${new Date(issue.slaDue).toLocaleString()}` : ''}</p>
${done && issue.csat === undefined ? `<h2>${T('howDidWeDo')}</h2><div class="stars">${stars}</div>` : issue.csat !== undefined ? `<p class="m">${T('thanksRating')} ${'★'.repeat(issue.csat)}.</p>` : ''}</div>
<div class="card"><h2>${T('conversation')}</h2>${conv !== '' ? conv : `<p class="m">${T('noMessages')}</p>`}
${done ? '' : `<form method="post" action="${cfg.base}/reply">${hidden}<label>${T('addMessage')}</label><textarea name="text" rows="3" required placeholder="${T('addPh')}"></textarea><p></p><button type="submit">${T('sendMsg')}</button></form>`}</div>
<p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p>`),
    html: true
  }
}

export async function portalReply (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const key = String(o.key ?? '')
  const email = String(o.email ?? '')
  const text = String(o.text ?? '').trim().slice(0, 5000)
  const issue = await requestFor(c, key, email)
  if (issue === undefined || text === '') return { status: 404, body: { error: 'not found' } }
  await c.addCollection(tracker.class.CustomerReply, issue.space, issue._id, tracker.class.Issue, 'customerReplies', { text, fromCustomer: true, author: email, at: Date.now() })
  await addComment(c, issue, `Customer wrote via the portal:\n${text}`)
  if (wantsHtml) {
    return { status: 303, body: '', html: true, ...({ location: `${cfg.base}/status?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}` } as any) }
  }
  return { status: 200, body: { ok: true } }
}

export async function portalOrg (c: PlatformClient, cfg: PortalConfig, email: string, wantsHtml: boolean): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  if (project === undefined || domain === '') return wantsHtml ? { status: 400, body: page(cfg, 'Organisation', `<div class="card"><h2>Enter your work email.</h2><p><a class="btn" href="${cfg.base}">Back</a></p></div>`), html: true } : { status: 400, body: { error: 'email required' } }
  const org = await orgFor(c, project, email)
  const issues = Array.from(await c.findAll(tracker.class.Issue, org !== undefined ? { space: project._id, customerOrg: org._id } : { space: project._id, portalEmail: { $like: `%@${domain}` } as any }, { limit: 200, sort: { modifiedOn: -1 as any } }))
  const statuses = await c.findAll(tracker.class.IssueStatus, {})
  const nameOf = new Map(Array.from(statuses).map((s) => [s._id, s.name]))
  if (!wantsHtml) return { status: 200, body: { organisation: org?.name ?? domain, requests: issues.map((i) => ({ key: i.identifier, title: i.title, status: nameOf.get(i.status) ?? '', updated: i.modifiedOn })) } }
  const rows = issues.map((i) => `<tr><td><a href="${cfg.base}/status?key=${encodeURIComponent(i.identifier)}&email=${encodeURIComponent(i.portalEmail ?? email)}">${esc(i.identifier)}</a></td><td>${esc(i.title)}</td><td>${esc(nameOf.get(i.status) ?? '')}</td><td>${esc(i.portalEmail ?? '')}</td><td>${new Date(i.modifiedOn).toLocaleDateString()}</td></tr>`).join('')
  return { status: 200, body: page(cfg, org?.name ?? domain, `<div class="card"><h2>${esc(org?.name ?? domain)} · ${issues.length} request${issues.length === 1 ? '' : 's'}</h2><p class="m">Everyone with an @${esc(domain)} address sees this list. Open a request with the email it was raised with.</p>${issues.length > 0 ? `<table><thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Raised by</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>` : ''}</div><p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p>`), html: true }
}

const PRIORITY_WORDS: Record<string, IssuePriority> = { highest: IssuePriority.Urgent, urgent: IssuePriority.Urgent, critical: IssuePriority.Urgent, high: IssuePriority.High, medium: IssuePriority.Medium, normal: IssuePriority.Medium, low: IssuePriority.Low, lowest: IssuePriority.Low }

function fieldHtml (f: FormField, value: string): string {
  const req = f.required === true ? ' required' : ''
  const name = esc(f.key)
  const kb = f.mapTo === 'title' ? ' data-kb="1"' : ''
  const label = `<label>${esc(f.label)}${f.required === true ? ' *' : ''}</label>`
  switch (f.type) {
    case 'textarea':
      return `${label}<textarea name="${name}" rows="5" placeholder="${esc(f.placeholder ?? '')}"${req}>${esc(value)}</textarea>`
    case 'select':
      return `${label}<select name="${name}"${req}><option value="">—</option>${(f.options ?? []).map((o) => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    case 'multiselect':
      return `${label}<div>${(f.options ?? []).map((o) => `<label style="display:inline-flex;gap:.3rem;margin-right:.8rem;text-transform:none;font-weight:400;color:inherit"><input type="checkbox" name="${name}" value="${esc(o)}" style="width:auto">${esc(o)}</label>`).join('')}</div>`
    case 'checkbox':
      return `<label style="display:inline-flex;gap:.4rem;align-items:center;text-transform:none;font-weight:400;color:inherit"><input type="checkbox" name="${name}" value="yes" style="width:auto">${esc(f.label)}</label>`
    case 'number':
      return `${label}<input type="number" name="${name}" value="${esc(value)}"${req}>`
    case 'date':
      return `${label}<input type="date" name="${name}" value="${esc(value)}"${req}>`
    case 'email':
      return `${label}<input type="email" name="${name}" value="${esc(value)}" placeholder="${esc(f.placeholder ?? 'you@company.com')}"${req}>`
    case 'url':
      return `${label}<input type="url" name="${name}" value="${esc(value)}" placeholder="https://…"${req}>`
    default:
      return `${label}<input name="${name}" value="${esc(value)}" placeholder="${esc(f.placeholder ?? '')}"${req}${kb}>`
  }
}

/** GET renders a public form; POST creates the issue from its answers. */
export async function portalForm (c: PlatformClient, cfg: PortalConfig, formSlug: string, method: string, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  const form: IssueForm | undefined = project !== undefined ? (await c.findAll(tracker.class.IssueForm, { space: project._id, slug: formSlug, public: true }, { limit: 1 }))[0] : undefined
  if (project === undefined || form === undefined) {
    return wantsHtml ? { status: 404, body: page(cfg, 'Not found', `<div class="card"><h2>No such form.</h2><p><a class="btn" href="${cfg.base}">Back</a></p></div>`), html: true } : { status: 404, body: { error: 'no such form' } }
  }
  const hasEmail = form.fields.some((f) => f.mapTo === 'portalEmail' || f.type === 'email')
  const render = (errors: string[], values: Record<string, string>): Result => ({
    status: errors.length > 0 ? 400 : 200,
    html: true,
    body: page(cfg, form.name, `<div class="card"><h2>${esc(form.name)}</h2>${form.description ? `<p class="m">${esc(form.description)}</p>` : ''}${errors.length > 0 ? `<p class="m" style="color:#dc2626">${errors.map(esc).join('<br>')}</p>` : ''}
<form method="post" action="${cfg.base}/form/${esc(form.slug)}${cfg.embed === true ? '?embed=1' : ''}">${form.fields.map((f) => fieldHtml(f, values[f.key] ?? '')).join('')}${hasEmail ? '' : `<label>${esc(t(cfg, 'email'))}</label><input type="email" name="__email" value="${esc(values.__email ?? '')}" placeholder="you@company.com" required>`}<p></p><button type="submit">${esc(t(cfg, 'sendMsg'))}</button></form></div>`)
  })
  if (method !== 'POST') return wantsHtml ? render([], {}) : { status: 200, body: { name: form.name, description: form.description, fields: form.fields } }
  const val = (k: string): string => {
    const v = o[k]
    return Array.isArray(v) ? v.map(String).join(', ') : v == null ? '' : String(v)
  }
  const errors: string[] = []
  for (const f of form.fields) {
    const v = val(f.key)
    if (f.required === true && v.trim() === '' && !(f.type === 'checkbox' && v === 'yes')) errors.push(`${f.label} is required`)
    if (f.type === 'email' && v !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push(`${f.label} must be an email address`)
  }
  const emailField = form.fields.find((f) => f.mapTo === 'portalEmail') ?? form.fields.find((f) => f.type === 'email')
  const email = (emailField !== undefined ? val(emailField.key) : val('__email')).trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('A valid email is required')
  if (errors.length > 0) return wantsHtml ? render(errors, Object.fromEntries(form.fields.map((f) => [f.key, val(f.key)]).concat([['__email', val('__email')]]))) : { status: 400, body: { errors } }
  let title = ''
  const lines: string[] = []
  const extra: Record<string, unknown> = {}
  let priority: IssuePriority | undefined
  let assignee = null as Awaited<ReturnType<typeof personByEmail>>
  let dueDate: number | undefined
  const labels: string[] = []
  for (const f of form.fields) {
    const v = val(f.key).trim()
    if (v === '') continue
    switch (f.mapTo) {
      case 'title': title = v; break
      case 'description': lines.push(v); break
      case 'priority': priority = PRIORITY_WORDS[v.toLowerCase()]; break
      case 'assignee': assignee = v.includes('@') ? await personByEmail(c, v) : null; break
      case 'dueDate': dueDate = Number.isNaN(Date.parse(v)) ? undefined : Date.parse(v); break
      case 'labels': labels.push(...v.split(',').map((x) => x.trim()).filter((x) => x !== '')); break
      case 'estimation': extra.estimation = Number(v) || 0; break
      case 'severity': extra.severity = Math.min(4, Math.max(1, Number(v) || 3)); break
      case 'risk': extra.risk = ['low', 'medium', 'high'].includes(v.toLowerCase()) ? v.toLowerCase() : 'medium'; break
      case 'portalEmail': break
      default: lines.push(`${f.label}: ${v}`)
    }
  }
  if (title === '') title = `${form.name} · ${new Date().toLocaleDateString()}`
  const org = await orgFor(c, project, email)
  const issue = await createIssue(c, project, {
    title,
    description: `From: ${email}${org !== undefined ? ` (${org.name})` : ''} via form "${form.name}"\n\n${lines.join('\n\n')}`,
    priority,
    assignee,
    requestType: form.requestType != null,
    requestTypeId: form.requestType ?? undefined,
    portalEmail: email,
    customerOrg: org?._id,
    dueDate
  })
  if (Object.keys(extra).length > 0) await c.updateDoc(tracker.class.Issue, issue.space, issue._id, extra as any)
  for (const l of [...labels, `form: ${form.slug}`]) await addTag(c, issue, l)
  await c.updateDoc(tracker.class.IssueForm, form.space, form._id, { submissions: (form.submissions ?? 0) + 1 })
  const statusUrl = `${cfg.publicUrl.replace(/\/$/, '')}${cfg.base}/status?key=${encodeURIComponent(issue.identifier)}&email=${encodeURIComponent(email)}`
  if (wantsHtml) return { status: 200, html: true, body: page(cfg, t(cfg, 'thankYou'), `<div class="card"><h2>${esc(form.successText ?? t(cfg, 'thankYou'))} <span class="pill">${esc(issue.identifier)}</span></h2><p class="m">${esc(t(cfg, 'follow'))} <a href="${esc(statusUrl)}">${esc(statusUrl)}</a></p><p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p></div>`) }
  return { status: 200, body: { created: issue.identifier, status: statusUrl } }
}

async function addTag (c: PlatformClient, issue: Issue, title: string): Promise<void> {
  const TAG_ELEMENT = 'tags:class:TagElement' as Ref<Class<Doc>>
  const TAG_REFERENCE = 'tags:class:TagReference' as Ref<Class<Doc>>
  let el = (await c.findAll(TAG_ELEMENT, { title, targetClass: tracker.class.Issue } as any, { limit: 1 }))[0] as any
  if (el === undefined) {
    const _id = await c.createDoc(TAG_ELEMENT, 'core:space:Workspace' as any, { title, description: '', targetClass: tracker.class.Issue, color: Math.floor(Math.random() * 20), category: 'tags:category:NoCategory' } as any)
    el = { _id, title, color: 0 }
  }
  await c.addCollection(TAG_REFERENCE, issue.space, issue._id, tracker.class.Issue, 'labels', { tag: el._id, title, color: el.color ?? 0 } as any)
}

const rice = (i: Idea): number => Math.round((Math.max(1, i.reach) * i.impact * i.confidence) / Math.max(1, i.effort))

/** Public idea board: vote by email, suggest an idea. */
export async function portalIdeas (c: PlatformClient, cfg: PortalConfig, method: string, sub: string, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const project = cfg.project !== '' ? await findProject(c, cfg.project) : undefined
  if (project === undefined) return { status: 404, body: { error: 'no project' } }
  const email = String(o.email ?? '').trim().toLowerCase()
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  if (method === 'POST' && sub === 'vote') {
    const idea = (await c.findAll(tracker.class.Idea, { _id: String(o.id ?? '') as Ref<Idea>, space: project._id, public: true }, { limit: 1 }))[0]
    if (idea === undefined || !validEmail) return wantsHtml ? { status: 400, body: page(cfg, 'Vote', `<div class="card"><h2>Enter your email to vote.</h2><p><a class="btn" href="${cfg.base}/ideas">Back</a></p></div>`), html: true } : { status: 400, body: { error: 'id and email required' } }
    const voters = idea.voters.includes(email) ? idea.voters.filter((v) => v !== email) : [...idea.voters, email]
    await c.updateDoc(tracker.class.Idea, idea.space, idea._id, { voters })
    if (wantsHtml) return { status: 303, body: '', html: true, ...({ location: `${cfg.base}/ideas?email=${encodeURIComponent(email)}` } as any) }
    return { status: 200, body: { votes: voters.length } }
  }
  if (method === 'POST' && sub === 'suggest') {
    const title = String(o.title ?? '').trim()
    if (title === '' || !validEmail) return wantsHtml ? { status: 400, body: page(cfg, 'Suggest', `<div class="card"><h2>Give the idea a title and your email.</h2><p><a class="btn" href="${cfg.base}/ideas">Back</a></p></div>`), html: true } : { status: 400, body: { error: 'title and email required' } }
    await c.createDoc(tracker.class.Idea, project._id, { title: title.slice(0, 200), description: String(o.details ?? '').slice(0, 5000), status: 'new', impact: 3, effort: 3, confidence: 2, reach: 1, voters: [email], tags: ['portal'], owner: null, insights: [{ at: Date.now(), text: `Suggested via the portal by ${email}`, by: email }], linkedIssues: [], goal: null, public: true })
    if (wantsHtml) return { status: 303, body: '', html: true, ...({ location: `${cfg.base}/ideas?email=${encodeURIComponent(email)}` } as any) }
    return { status: 200, body: { ok: true } }
  }
  const T = (k: string): string => esc(t(cfg, k))
  const ideas: Idea[] = Array.from(await c.findAll(tracker.class.Idea, { space: project._id, public: true }, { limit: 200 })).filter((i) => i.status !== 'declined').sort((a, b) => b.voters.length - a.voters.length || rice(b) - rice(a))
  if (!wantsHtml) return { status: 200, body: { ideas: ideas.map((i) => ({ id: i._id, title: i.title, description: i.description, status: i.status, votes: i.voters.length })) } }
  const STATUS: Record<string, string> = { new: 'New', exploring: 'Exploring', validated: 'Validated', planned: 'Planned', shipped: 'Shipped' }
  const rows = ideas.map((i) => `<div class="inc"><form method="post" action="${cfg.base}/ideas/vote" style="display:flex;gap:.8rem;align-items:flex-start"><input type="hidden" name="id" value="${esc(i._id)}"><input type="hidden" name="email" value="${esc(email)}"><button type="submit" title="${email === '' ? 'Enter your email above to vote' : (i.voters.includes(email) ? 'Remove your vote' : 'Vote')}" style="min-width:4rem;background:${i.voters.includes(email) ? 'var(--c)' : 'color-mix(in srgb,var(--c) 25%,transparent)'};color:${i.voters.includes(email) ? '#fff' : 'inherit'}">▲ ${i.voters.length}</button><div><b>${esc(i.title)}</b> <span class="pill">${esc(STATUS[i.status] ?? i.status)}</span>${i.description ? `<p class="m" style="margin:.2rem 0 0">${esc(i.description.slice(0, 300))}</p>` : ''}</div></form></div>`).join('')
  return {
    status: 200,
    html: true,
    body: page(cfg, t(cfg, 'ideas'), `<div class="card"><h2>${T('ideas')}</h2><p class="m">${T('voteIntro')}</p><form method="get" action="${cfg.base}/ideas"><input name="email" type="email" value="${esc(email)}" placeholder="you@company.com"><p></p><button type="submit">${T('useEmail')}</button></form></div>
<div class="card">${rows !== '' ? rows : `<p class="m">${T('noIdeas')}</p>`}</div>
<div class="card"><h2>${T('suggest')}</h2><form method="post" action="${cfg.base}/ideas/suggest"><input type="hidden" name="email" value="${esc(email)}">${email === '' ? `<label>${T('email')}</label><input name="email" type="email" required placeholder="you@company.com">` : ''}<label>${T('idea')}</label><input name="title" required placeholder="${T('oneLine')}"><label>${T('why')}</label><textarea name="details" rows="4" placeholder="${T('whyPh')}"></textarea><p></p><button type="submit">${T('suggestBtn')}</button></form></div>
<p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p>`)
  }
}

export async function portalRate (c: PlatformClient, cfg: PortalConfig, o: Record<string, unknown>, wantsHtml: boolean): Promise<Result> {
  const key = String(o.key ?? '')
  const email = String(o.email ?? '')
  const score = Math.min(5, Math.max(1, Number(o.score ?? 0)))
  const issue = await requestFor(c, key, email)
  if (issue === undefined || Number.isNaN(score)) return { status: 404, body: { error: 'not found' } }
  if (issue.csat === undefined) {
    await c.updateDoc(tracker.class.Issue, issue.space, issue._id, { csat: score, csatComment: String(o.comment ?? '').trim() || undefined })
    await addComment(c, issue, `Customer rated this request ${score}/5 via the help centre.`)
  }
  if (wantsHtml) return { status: 200, body: page(cfg, 'Thank you', `<div class="card"><h2>Thank you</h2><p class="m">Your rating for ${esc(key)} is recorded.</p><p><a class="btn" href="${cfg.base}">${esc(cfg.name)}</a></p></div>`), html: true }
  return { status: 200, body: { ok: true } }
}

// ---- public read-only issue page -------------------------------------------------------
const PRIORITY_NAMES = ['No priority', 'Urgent', 'High', 'Medium', 'Low']
export async function portalShare (c: PlatformClient, env: PortalConfig, token: string, lang: string, wantsHtml: boolean): Promise<Result> {
  const issue = token.length >= 16 ? (await c.findAll(tracker.class.Issue, { shareToken: token }, { limit: 1 }))[0] : undefined
  if (issue === undefined) return wantsHtml ? { status: 404, body: page({ ...env, lang }, 'Not found', '<div class="card"><h2>This link is not active.</h2></div>'), html: true } : { status: 404, body: { error: 'not found' } }
  const project = (await c.findAll(tracker.class.Project, { _id: issue.space }, { limit: 1 }))[0]
  const cfg: PortalConfig = { ...((project?.portal?.enabled === true ? await resolvePortal(c, env, project.portal.slug) : undefined) ?? { ...env, base: '/portal' }), lang }
  const T = (k: string): string => esc(t(cfg, k))
  const { name: status, done } = await statusLabel(c, issue)
  const assignee = issue.assignee != null ? (await c.findAll(contact.class.Person, { _id: issue.assignee as any }, { limit: 1 }))[0] : undefined
  const labels = Array.from(await c.findAll('tags:class:TagReference' as Ref<Class<Doc>>, { attachedTo: issue._id } as any, { limit: 50 })).map((r: any) => String(r.title ?? ''))
  let description = ''
  try {
    description = issue.description != null && issue.description !== '' ? await c.fetchMarkup(tracker.class.Issue, issue._id, 'description', issue.description, 'html') : ''
  } catch {
    description = ''
  }
  const info = { key: issue.identifier, title: issue.title, status, done, priority: PRIORITY_NAMES[issue.priority] ?? '', assignee: assignee !== undefined ? formatName(assignee.name) : null, labels, updated: issue.modifiedOn, created: issue.createdOn }
  if (!wantsHtml) return { status: 200, body: info }
  const body = `<div class="card"><p class="m">${T('readOnly')}</p><h2><span class="pill">${esc(issue.identifier)}</span> ${esc(issue.title)}</h2>
<p class="m">${T('status')}: <b>${esc(status)}</b> · ${T('priority')}: <b>${esc(info.priority)}</b> · ${T('assignee')}: <b>${esc(info.assignee ?? '—')}</b>${labels.length > 0 ? ` · ${T('labels')}: ${labels.map((l) => `<span class="pill">${esc(l)}</span>`).join(' ')}` : ''}</p>
<p class="m">${T('updated')} ${new Date(issue.modifiedOn).toLocaleString()}</p>
<article>${description !== '' ? description : `<p class="m">${T('noDescription')}</p>`}</article></div>`
  return { status: 200, html: true, body: page(cfg, `${issue.identifier} · ${t(cfg, 'sharedIssue')}`, body).replace('<head>', '<head><meta name="robots" content="noindex, nofollow">') }
}

// ---- embeddable collector ---------------------------------------------------------------
/** A script tag for any website: floating button that opens a public form in an overlay. */
export function collectorJs (publicUrl: string, portalSlug: string, formSlug: string, label: string, color: string): string {
  const src = `${publicUrl}/portal${portalSlug !== '' ? '/' + encodeURIComponent(portalSlug) : ''}/form/${encodeURIComponent(formSlug)}?embed=1`
  return `(function(){if(window.__ceepeeCollector)return;window.__ceepeeCollector=1;var c=${JSON.stringify(color)},src=${JSON.stringify(src)},label=${JSON.stringify(label)};
var st=document.createElement('style');st.textContent='.cp-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;padding:12px 18px;border:0;border-radius:999px;background:'+c+';color:#fff;font:600 14px/1 system-ui,sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.5);cursor:pointer}.cp-btn:hover{filter:brightness(1.08)}.cp-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(10,9,18,.55);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:16px}.cp-ov.on{display:flex}.cp-fr{width:min(560px,100%);height:min(720px,92vh);border:0;border-radius:16px;background:#fff;box-shadow:0 40px 90px -30px rgba(0,0,0,.7)}.cp-x{position:absolute;top:14px;right:18px;border:0;background:rgba(255,255,255,.15);color:#fff;font:20px/1 system-ui;width:36px;height:36px;border-radius:50%;cursor:pointer}';document.head.appendChild(st);
var b=document.createElement('button');b.className='cp-btn';b.textContent=label;var ov=document.createElement('div');ov.className='cp-ov';var x=document.createElement('button');x.className='cp-x';x.textContent='×';var fr=document.createElement('iframe');fr.className='cp-fr';fr.title=label;ov.appendChild(x);ov.appendChild(fr);
function open(){if(!fr.src)fr.src=src;ov.classList.add('on')}function close(){ov.classList.remove('on');fr.src='';fr.removeAttribute('src')}
b.addEventListener('click',open);x.addEventListener('click',close);ov.addEventListener('click',function(e){if(e.target===ov)close()});window.addEventListener('message',function(e){if(e.data==='ceepee-collector-close')close()});
function mount(){document.body.appendChild(b);document.body.appendChild(ov)}if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount)})();`
}
