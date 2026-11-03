#!/usr/bin/env bash
set -euo pipefail

FILE="apps/web/app/components/CallPanel.tsx"
CSS="apps/web/app/style.css"

if [[ ! -f "$FILE" || ! -f "$CSS" ]]; then
  echo "Run this script from the frontend repository root (expected $FILE and $CSS)." >&2
  exit 1
fi

python - <<'PY'
from pathlib import Path
p = Path('apps/web/app/components/CallPanel.tsx')
s = p.read_text(encoding='utf-8')
old = '''<header className="call-window-head"><div><strong>{mode === 'video' ? 'Video call' : 'Voice call'}</strong><small>{status}{connectedAtRef.current ? ` · ${clock(elapsed)}` : ''}</small></div><button className="icon-button" onClick={() => void hangup()} aria-label="Close call"><Icon name="close" /></button></header>'''
new = '''<header className="call-window-head"><div><strong>{mode === 'video' ? 'Video call' : 'Voice call'}</strong><small>{status}{connectedAtRef.current ? ` · ${clock(elapsed)}` : ''}</small></div><div className="call-header-actions"><button type="button" className="icon-button call-fullscreen-toggle" onClick={() => setIsFullscreen((value) => !value)} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{isFullscreen ? '↙' : '⛶'}</button><button className="icon-button" onClick={() => void hangup()} aria-label="Close call"><Icon name="close" /></button></div></header>'''
if 'call-fullscreen-toggle' not in s:
    if old not in s:
        raise SystemExit('Could not locate exact CallPanel header. No changes made to CallPanel.tsx.')
    s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')
    print('Added fullscreen toggle to CallPanel.tsx')
else:
    print('Fullscreen toggle already exists in CallPanel.tsx')
PY

cat >> "$CSS" <<'CSS'

/* Connectly call screen: responsive theme-aware settings and fullscreen action */
.call-window-head { min-width: 0; }
.call-header-actions { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
.call-fullscreen-toggle { font-size:22px; line-height:1; }
.call-video-tools-enhanced {
  box-sizing:border-box;
  width:100%; min-width:0; max-width:100%;
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr));
  align-items:stretch !important;
  gap:10px !important;
  padding:12px !important;
  border:1px solid var(--line, rgba(148,163,184,.25)) !important;
  border-radius:14px;
  background:var(--panel-2, #172235) !important;
  color:var(--text, #edf4ff) !important;
  overflow:hidden;
}
.call-video-tools-enhanced .call-tool-select,
.call-video-tools-enhanced .call-custom-background,
.call-video-tools-enhanced .call-flip-button {
  box-sizing:border-box; min-width:0; max-width:100%; width:100%;
  color:var(--text, #edf4ff) !important;
}
.call-video-tools-enhanced .call-tool-select { gap:6px; }
.call-video-tools-enhanced .call-tool-select span { color:var(--muted, #a8b7cc); }
.call-video-tools-enhanced .call-tool-select select {
  box-sizing:border-box; width:100%; min-width:0; max-width:100%;
  color:var(--text, #edf4ff) !important;
  background:var(--panel, #101a2a) !important;
  border:1px solid var(--line, rgba(148,163,184,.3)) !important;
}
.call-video-tools-enhanced .call-custom-background {
  grid-column:1 / -1; justify-content:center; white-space:normal;
  min-width:0; overflow-wrap:anywhere;
  background:var(--panel, #101a2a) !important;
  border:1px solid var(--line, rgba(148,163,184,.3)) !important;
}
.call-video-tools-enhanced .call-flip-button { grid-column:1 / -1; }
.call-video-tools-enhanced .call-background-status,
.call-video-tools-enhanced .call-background-error { grid-column:1 / -1; overflow-wrap:anywhere; }
.call-fullscreen-mode { padding:0 !important; }
.call-fullscreen-mode > .call-window { width:100vw !important; height:100dvh !important; max-width:none !important; max-height:100dvh !important; border-radius:0 !important; }
@media (max-width:600px) {
  .call-video-tools-enhanced { grid-template-columns:minmax(0,1fr) !important; gap:8px !important; padding:10px !important; }
  .call-video-tools-enhanced .call-custom-background,
  .call-video-tools-enhanced .call-flip-button { grid-column:1 !important; }
  .call-video-tools-enhanced { max-height: min(30dvh, 230px) !important; overflow-y:auto !important; overflow-x:hidden !important; }
  .call-header-actions .icon-button { width:40px; height:40px; }
}
CSS

echo "CallPanel fullscreen toggle and responsive theme-aware call settings patched."
