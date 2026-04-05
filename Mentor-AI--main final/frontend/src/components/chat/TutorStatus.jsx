export default function TutorStatus({ status }) {
  if (!status) return null;

  return (
    <div className="tutor-status">
      Tutor is {status.toLowerCase()}…
    </div>
  );
}
