import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, Spinner } from "react-bootstrap";
import {
  downloadGroupHealthResult,
  downloadGroupHealthSource,
  fetchMyGroupHealthAssignments,
  uploadGroupHealthResult,
  type GroupHealthAssignment,
} from "../../api/groupHealth";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".csv", ".pdf", ".xls", ".xlsx"];

const reviewLabel = (status: string) => {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Needs changes";
  return "Pending Admin review";
};

export default function DoctorGroupHealth() {
  const [assignments, setAssignments] = useState<GroupHealthAssignment[]>([]);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMyGroupHealthAssignments()
      .then(setAssignments)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load assignments"))
      .finally(() => setLoading(false));
  }, []);

  const submitResult = async (assignment: GroupHealthAssignment) => {
    const file = files[assignment.id];
    if (!file) {
      setAssignmentErrors((current) => ({ ...current, [assignment.id]: "Choose a result file first." }));
      return;
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setAssignmentErrors((current) => ({ ...current, [assignment.id]: "Upload a CSV, XLS, XLSX, or PDF file." }));
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      setAssignmentErrors((current) => ({ ...current, [assignment.id]: "File must be between 1 byte and 15 MB." }));
      return;
    }

    setBusyId(assignment.id);
    setAssignmentErrors((current) => ({ ...current, [assignment.id]: "" }));
    try {
      const updated = await uploadGroupHealthResult(assignment.id, file);
      setAssignments((current) => current.map((item) => item.id === assignment.id ? updated : item));
      setFiles((current) => ({ ...current, [assignment.id]: undefined }));
      const input = document.getElementById(`result-file-${assignment.id}`) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (cause: unknown) {
      setAssignmentErrors((current) => ({
        ...current,
        [assignment.id]: cause instanceof Error ? cause.message : "Could not upload result file.",
      }));
    } finally {
      setBusyId(null);
    }
  };

  const downloadSource = async (assignment: GroupHealthAssignment) => {
    setBusyId(assignment.id);
    setAssignmentErrors((current) => ({ ...current, [assignment.id]: "" }));
    try {
      await downloadGroupHealthSource(assignment.id, assignment.sourceFileName || "group-health-assignment.xlsx");
    } catch (cause: unknown) {
      setAssignmentErrors((current) => ({
        ...current,
        [assignment.id]: cause instanceof Error ? cause.message : "Could not download assigned file.",
      }));
    } finally {
      setBusyId(null);
    }
  };

  const downloadResult = async (assignment: GroupHealthAssignment, version: number, fileName: string) => {
    setBusyId(assignment.id);
    setAssignmentErrors((current) => ({ ...current, [assignment.id]: "" }));
    try {
      await downloadGroupHealthResult(assignment.id, version, fileName);
    } catch (cause: unknown) {
      setAssignmentErrors((current) => ({
        ...current,
        [assignment.id]: cause instanceof Error ? cause.message : "Could not download result file.",
      }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="py-3">
      <div className="mb-4">
        <h4>Group health assignments</h4>
        <p className="text-muted mb-0">Assignments appear here after Admin approves the group health request.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : assignments.length === 0 ? (
        <Card body className="text-muted">No approved assignments have been assigned to you.</Card>
      ) : (
        <div className="d-grid gap-3">
          {assignments.map((assignment) => (
            <Card key={assignment.id}>
              <Card.Body>
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <h5 className="mb-1">{assignment.groupName}</h5>
                    <div className="text-muted">
                      {[assignment.departments, assignment.shiftDate, assignment.shift, assignment.specialtyName]
                        .filter(Boolean)
                        .join(" · ") || "Assignment details"}
                    </div>
                  </div>
                  <Badge bg={assignment.resultStatus === "APPROVED" ? "success" : assignment.resultStatus === "REJECTED" ? "danger" : assignment.resultStatus === "UPLOADED" ? "warning" : "secondary"}>
                    {assignment.resultStatus === "NONE" ? "Not uploaded" : assignment.resultStatus}
                  </Badge>
                </div>

                {assignment.capacityAllocated !== null && (
                  <p className="mb-2"><strong>Allocated capacity:</strong> {assignment.capacityAllocated}</p>
                )}
                {assignment.note && <p className="mb-3"><strong>Note:</strong> {assignment.note}</p>}

                <div className="d-flex flex-wrap gap-2 mb-3">
                  <Button
                    variant="outline-primary"
                    disabled={!assignment.sourceFileAvailable || busyId === assignment.id}
                    onClick={() => void downloadSource(assignment)}
                  >
                    {busyId === assignment.id ? "Please wait…" : "Download assigned file"}
                  </Button>
                  {!assignment.sourceFileAvailable && <span className="text-muted align-self-center">No source file attached.</span>}
                </div>

                <Form onSubmit={(event) => { event.preventDefault(); void submitResult(assignment); }}>
                  <Form.Group className="mb-2" controlId={`result-file-${assignment.id}`}>
                    <Form.Label>Upload result (CSV, XLS, XLSX, or PDF; maximum 15 MB)</Form.Label>
                    <Form.Control
                      id={`result-file-${assignment.id}`}
                      type="file"
                      accept=".csv,.xls,.xlsx,.pdf"
                      onChange={(event) => setFiles((current) => ({ ...current, [assignment.id]: (event.target as HTMLInputElement).files?.[0] }))}
                    />
                  </Form.Group>
                  <Button type="submit" disabled={busyId === assignment.id || !files[assignment.id]}>
                    {busyId === assignment.id ? "Uploading…" : assignment.resultFiles.length ? "Upload new version" : "Upload result"}
                  </Button>
                </Form>

                {assignmentErrors[assignment.id] && <Alert variant="danger" className="mt-3 mb-0">{assignmentErrors[assignment.id]}</Alert>}

                {assignment.resultFiles.length > 0 && (
                  <div className="mt-4">
                    <h6>Uploaded versions</h6>
                    <ul className="list-group">
                      {assignment.resultFiles.slice().sort((a, b) => b.version - a.version).map((file) => (
                        <li key={file.version} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                          <div>
                            <div>Version {file.version}: {file.originalName}</div>
                            <small className="text-muted">
                              {file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : ""} · {reviewLabel(file.reviewStatus)}
                              {file.reviewNote ? ` · ${file.reviewNote}` : ""}
                            </small>
                          </div>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            disabled={busyId === assignment.id}
                            onClick={() => void downloadResult(assignment, file.version, file.originalName)}
                          >
                            Download
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card.Body>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
