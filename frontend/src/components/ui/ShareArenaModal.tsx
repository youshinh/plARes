import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ShareArenaModalProps {
  roomId: string;
  uiLang: 'ja' | 'en' | 'es';
  open: boolean;
  onClose: () => void;
}

export const ShareArenaModal: React.FC<ShareArenaModalProps> = ({
  roomId,
  uiLang,
  open,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const getTexts = () => {
    switch (uiLang) {
      case 'ja':
        return {
          title: 'アリーナを共有',
          desc: 'このQRコードを別のスマホで読み取るか、URLをシェアして対戦相手・観客を招待します。専用アプリは不要です。',
          copy: 'URLをコピー',
          copied: 'コピー完了！',
          close: '閉じる',
          roomIdLabel: 'ルームID',
        };
      case 'es':
        return {
          title: 'Compartir Arena',
          desc: 'Escanea el QR o comparte el enlace para invitar rivales y espectadores. No requiere app.',
          copy: 'Copiar enlace',
          copied: '¡Copiado!',
          close: 'Cerrar',
          roomIdLabel: 'ID de Sala',
        };
      case 'en':
      default:
        return {
          title: 'Share Arena',
          desc: 'Scan this QR or share the URL to invite opponents or spectators. No app required.',
          copy: 'Copy URL',
          copied: 'Copied!',
          close: 'Close',
          roomIdLabel: 'Room ID',
        };
    }
  };

  const t = getTexts();
  
  // Construct the shareable URL
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set('room', roomId);
  const shareHref = shareUrl.toString();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareHref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="hud-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="hud-modal-content"
        style={{ textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        aria-describedby="share-modal-desc"
      >
        <h2 id="share-modal-title">{t.title}</h2>
        <p id="share-modal-desc" className="hud-dim">{t.desc}</p>
        
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'inline-block', margin: '16px 0' }}>
          <QRCodeSVG value={shareHref} size={200} />
        </div>
        
        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#ffb26b' }}>
          {t.roomIdLabel}: {roomId}
        </div>

        <div className="hud-modal-actions" style={{ justifyContent: 'center' }}>
          <button className="hud-btn hud-btn-blue" onClick={handleCopy}>
            {copied ? t.copied : t.copy}
          </button>
          <button className="hud-btn hud-btn-steel" onClick={onClose} autoFocus>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};