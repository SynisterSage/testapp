export default function TemplatePicker({ onPick, currentCount }) {
    return (
      <div className="template-picker">
        <div className="template-title">Templates</div>
        <div className="template-row">
          <button className="pill" onClick={() => onPick(3)}>3-piece</button>
          <button className="pill" onClick={() => onPick(4)}>4-piece</button>
          <button className="pill" onClick={() => onPick(5)}>5-piece</button>
        </div>
        <div className="template-hint">Current: {currentCount || 0} drums</div>
      </div>
    );
  }
  