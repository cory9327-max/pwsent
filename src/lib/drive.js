// 구글 드라이브 업로드 — Google Picker 의 업로드 창으로 공유 폴더에 바로 올립니다.
// 권한은 drive.file (이 사이트로 올리거나 고른 파일만 접근) 이라 회원 드라이브 전체를 요구하지 않습니다.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID
export const FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID

export const driveConfigured = Boolean(CLIENT_ID && API_KEY && FOLDER_ID)
export const folderUrl = FOLDER_ID ? `https://drive.google.com/drive/folders/${FOLDER_ID}` : null

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const scripts = {}

function loadScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = resolve
      s.onerror = () => reject(new Error('script_load_failed'))
      document.head.appendChild(s)
    })
  }
  return scripts[src]
}

let token = null
let tokenExp = 0

async function getToken() {
  if (token && Date.now() < tokenExp - 60_000) return token
  await loadScript('https://accounts.google.com/gsi/client')
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error))
        token = resp.access_token
        tokenExp = Date.now() + Number(resp.expires_in || 3600) * 1000
        resolve(token)
      },
      error_callback: (e) => reject(new Error(e?.type || 'popup_closed')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

/**
 * 피커 열기. 업로드 탭(공유 폴더로 업로드) + 폴더 안 파일 선택 탭.
 * @returns {Promise<Array<{id,name,url,mimeType,sizeBytes}>>}
 */
export async function openDrivePicker(lang = 'ko') {
  if (!driveConfigured) throw new Error('drive_not_configured')
  const accessToken = await getToken()
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise((r) => window.gapi.load('picker', r))
  const p = window.google.picker

  const upload = new p.DocsUploadView().setParent(FOLDER_ID).setIncludeFolders(true)
  const browse = new p.DocsView(p.ViewId.DOCS).setParent(FOLDER_ID).setIncludeFolders(true).setEnableDrives(true)

  return new Promise((resolve) => {
    const builder = new p.PickerBuilder()
      .addView(upload)
      .addView(browse)
      .enableFeature(p.Feature.MULTISELECT_ENABLED)
      .enableFeature(p.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setLocale({ ko: 'ko', en: 'en', ja: 'ja' }[lang] || 'ko')
      .setCallback((data) => {
        if (data.action === p.Action.PICKED) {
          resolve(
            data.docs
              .filter((d) => d.mimeType !== 'application/vnd.google-apps.folder')
              .map((d) => ({
                id: d.id,
                name: d.name,
                url: d.url || `https://drive.google.com/file/d/${d.id}/view`,
                mimeType: d.mimeType,
                sizeBytes: d.sizeBytes ? Number(d.sizeBytes) : null,
              })),
          )
        } else if (data.action === p.Action.CANCEL) {
          resolve([])
        }
      })
    if (APP_ID) builder.setAppId(APP_ID)
    builder.build().setVisible(true)
  })
}
