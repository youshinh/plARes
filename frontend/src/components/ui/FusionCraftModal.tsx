import React, { useState, useRef } from 'react';
import { wsService } from '../../services/WebSocketService';
import { PLAYER_ID } from '../../utils/identity';

interface FusionCraftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * FusionCraftModal
 *
 * Architecture (Doc §2.3):
 * - Allows users to capture/upload an image of a real-world object.
 * - Provides a text input for the 'concept' of the fusion.
 * - Sends the request to the backend Nano Banana Pro (Gemini 2.0 Flash Image).
 */
export const FusionCraftModal: React.FC<FusionCraftModalProps> = ({ isOpen, onClose }) => {
  const [concept, setConcept] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isCrafting, setIsCrafting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCraft = async () => {
    if (!image || !concept.trim()) {
      alert('Please provide both an image and a concept.');
      return;
    }

    setIsCrafting(true);
    // In a real implementation, we might use a dedicated POST endpoint for images,
    // or send it as a base64 string via WebSocket if the payload is small enough.
    // Doc 9 §2.2 suggests a post-sync backend handler.
    
    // Simulate/Send via WebSocket event for now as per system core pattern
    wsService.sendEvent({
      event: 'item_dropped',
      user: PLAYER_ID,
      payload: {
        action: 'request_fusion',
        craft_request: true, // Existing backend expects this
        concept: concept.trim(),
        image_data: image.split(',')[1], // raw base64 for legacy or other parts
        reference_image: image.split(',')[1], // backend _generate_fusion_texture expects this
      },
    });

    // We'll receive the result via profile_sync / item_dropped broadcast
    setTimeout(() => {
        setIsCrafting(false);
        onClose();
        window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'Crafting request submitted! Generating texture...' }
        }));
    }, 1500);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content fusion-modal">
        <div className="modal-header">
          <h2>Real-World Fusion Craft</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p className="hint">Capture a real object to fuse its essence into your robot.</p>
          
          <div className="image-capture-zone" onClick={() => fileInputRef.current?.click()}>
            {image ? (
              <img src={image} alt="Captured" className="captured-preview" />
            ) : (
              <div className="capture-placeholder">
                <span className="icon">📷</span>
                <span>Click to Capture / Upload</span>
              </div>
            )}
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />
          </div>

          <div className="input-group">
            <label>Concentration Concept</label>
            <input
              type="text"
              placeholder="e.g. 'Cyberpunk Neon', 'Ancient Stone', 'Carbon Fiber'"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              disabled={isCrafting}
            />
          </div>

          <button 
            className={`craft-btn ${isCrafting ? 'loading' : ''}`}
            onClick={handleCraft}
            disabled={isCrafting || !image || !concept.trim()}
          >
            {isCrafting ? 'Fusing Essence...' : 'BEGIN FUSION'}
          </button>
        </div>
      </div>

      <style>{`
        .fusion-modal {
          max-width: 400px;
          background: #12161d;
          border: 1px solid #00f2ff;
          box-shadow: 0 0 25px rgba(0, 242, 255, 0.2);
        }
        .image-capture-zone {
          aspect-ratio: 16/9;
          background: #0a0e14;
          border: 2px dashed #30363d;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          margin-bottom: 20px;
          transition: all 0.2s;
        }
        .image-capture-zone:hover {
          border-color: #00f2ff;
          background: #161b22;
        }
        .capture-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: #8b949e;
        }
        .capture-placeholder .icon {
          font-size: 32px;
          margin-bottom: 8px;
        }
        .captured-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .input-group label {
          display: block;
          color: #00f2ff;
          font-size: 12px;
          text-transform: uppercase;
          margin-bottom: 8px;
          letter-spacing: 1px;
        }
        .input-group input {
          width: 100%;
          background: #0d1117;
          border: 1px solid #30363d;
          color: #c9d1d9;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
        }
        .input-group input:focus {
          border-color: #00f2ff;
        }
        .craft-btn {
          width: 100%;
          margin-top: 24px;
          padding: 15px;
          background: linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%);
          border: none;
          color: #000;
          font-weight: 800;
          border-radius: 8px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 2px;
          transition: transform 0.1s, opacity 0.2s;
        }
        .craft-btn:disabled {
          opacity: 0.5;
          filter: grayscale(1);
          cursor: not-allowed;
        }
        .craft-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .craft-btn.loading {
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% { opacity: 0.8; }
          50% { opacity: 1; }
          100% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};
