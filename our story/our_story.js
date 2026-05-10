
#alerts div {
    background: red;
    color: white;
    padding: 10px;
    margin: 5px;
  }
  /* BOB Notification Styles */
  .bob-notification {
    position: fixed;
    top: 90px;
    right: 20px;
    width: 360px;
    z-index: 10001;
    animation: bobSlideIn 0.3s ease;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
  }
  
  @keyframes bobSlideIn {
    from { transform: translateX(450px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  .bob-content {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    color: white;
  }
  
  .bob-icon { font-size: 28px; }
  .bob-text { flex: 1; }
  .bob-title { font-weight: bold; font-size: 15px; margin-bottom: 4px; }
  .bob-message { font-size: 12px; opacity: 0.92; line-height: 1.4; }
  
  .bob-close {
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.2s;
  }
  
  .bob-close:hover {
    background: rgba(255,255,255,0.35);
    transform: scale(1.1);
  }
  
  .bob-progress {
    height: 3px;
    background: rgba(255,255,255,0.4);
    animation: bobProgress linear forwards;
  }
  
  @keyframes bobProgress {
    from { width: 100%; }
    to { width: 0%; }
  }
  
  .bob-critical { background: linear-gradient(135deg, #ef4444, #dc2626); }
  .bob-warning { background: linear-gradient(135deg, #f59e0b, #d97706); }
  .bob-success { background: linear-gradient(135deg, #10b981, #059669); }
  .bob-info { background: linear-gradient(135deg, #3b82f6, #2563eb); }
  @media (max-width: 768px) {
    .bob-notification {
        width: calc(100% - 30px);
        right: 15px;
        left: 15px;
        top: 70px;
    }
  }