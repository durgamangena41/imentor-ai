import { useTutorStatus } from "../../hooks/useTutorStatus";
import TutorStatus from "../../components/chat/TutorStatus";

export default function TutorPage() {
  const tutorStatus = useTutorStatus();

  return (
    <>
      <TutorStatus status={tutorStatus} />
      {/* Chat window below */}
    </>
  );
}
