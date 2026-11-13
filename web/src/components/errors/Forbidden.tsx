import { Link } from 'react-router-dom';
import { Container, Row, Col} from 'react-bootstrap';
import { useAuth } from '../../hooks/useAuth';
import '../../styles/error.css';

export default function Forbidden() {
  const { userType } = useAuth();

  const getHomeRoute = () => {
    switch (userType) {
      case 'Doctor':
        return '/doctor/dashboard';
      case 'Receptionist':
        return '/receptionist/dashboard';
      case 'Admin':
        return '/admin/dashboard';
      default:
        return '/';
    }
  };

  const getHomeLabel = () => {
    switch (userType) {
      case 'Doctor':
        return 'Quay lại Bảng điều khiển Bác sĩ';
      case 'Receptionist':
        return 'Quay lại Bảng điều khiển Lễ tân';
      case 'Admin':
        return 'Quay lại Bảng điều khiển Quản trị';
      default:
        return 'Quay lại Trang chủ';
    }
  };

  return (
    <section className="err-wrap" aria-labelledby="fb-title">
      <Container>
        <Row className="justify-content-center">
          <Col md={10} lg={8} xl={6}>
            <div className="err-card shadow-sm">
              <div className="err-code err-403" aria-hidden>403</div>
              <h1 id="fb-title" className="err-title">Truy cập bị từ chối</h1>
              <p className="err-desc">
                Bạn không có quyền truy cập trang này. Vui lòng quay lại trang làm việc phù hợp với vai trò của bạn.
              </p>
              <div className="err-actions">
                <Link to={getHomeRoute()} className="btn btn-primary btn-lg err-btn">
                  {getHomeLabel()}
                </Link>
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    </section>
  );
}
