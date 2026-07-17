export default function Loading() {
  return (
    <div className="container recipe-page">
      <div className="recipe-topbar">
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
      </div>
      <div className="skeleton" style={{ width: "100%", aspectRatio: "3 / 2", maxHeight: 440, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 28, width: "60%", margin: "20px 0 12px" }} />
      <div className="skeleton" style={{ height: 14, width: "40%", marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 160, borderRadius: 16, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
    </div>
  );
}
