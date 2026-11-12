import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { http } from '../../api/http';

interface VideoRoomInfo {
  provider: string;
  roomName: string;
  domain: string;
  displayName: string;
  appointmentId: number;
  role: 'doctor' | 'patient';
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: any;
  }
}

export default function VideoCallPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const joinToken = searchParams.get('joinToken');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<VideoRoomInfo | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);

  useEffect(() => {
    if (!joinToken) {
      setError('Thiếu joinToken xác thực buổi khám. Vui lòng vào lại từ chi tiết lịch hẹn.');
      setLoading(false);
      return;
    }

    // Call backend API to verify token and retrieve room coordinates
    http
      .get(`/appointments/by-meeting-code/${code}/video-room?joinToken=${encodeURIComponent(joinToken)}`)
      .catch(() => {
        // Fallback for code based lookup or direct appointment id lookup if code is numeric
        return http.get(`/appointments/${code}/video-room?joinToken=${encodeURIComponent(joinToken)}`);
      })
      .then((res: any) => {
        setRoomInfo(res.data?.data || res.data);
        setLoading(false);
      })
      .catch((err: any) => {
        const msg = err.response?.data?.message || 'Không thể tham gia phòng khám. Vui lòng kiểm tra lại thời gian ca khám hoặc quyền truy cập.';
        setError(msg);
        setLoading(false);
      });
  }, [code, joinToken]);

  useEffect(() => {
    if (!roomInfo || !jitsiContainerRef.current) return;

    // Load external Jitsi API script if not loaded
    const scriptId = 'jitsi-external-api-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initJitsi = () => {
      if (!window.JitsiMeetExternalAPI || !jitsiContainerRef.current) return;
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
      }

      const domain = roomInfo.domain || 'meet.jit.si';
      const options = {
        roomName: roomInfo.roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainerRef.current,
        userInfo: {
          displayName: roomInfo.displayName || (roomInfo.role === 'doctor' ? 'Bác sĩ' : 'Bệnh nhân'),
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone',
            'camera',
            'closedcaptions',
            'desktop',
            'fullscreen',
            'fodeviceselection',
            'hangup',
            'chat',
            'settings',
            'videoquality',
          ],
        },
      };

      const apiInstance = new window.JitsiMeetExternalAPI(domain, options);
      jitsiApiRef.current = apiInstance;

      apiInstance.addEventListeners({
        videoConferenceLeft: () => {
          navigate(roomInfo.role === 'doctor' ? '/doctor/appointments' : '/patient/appointments');
        },
      });
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://${roomInfo.domain || 'meet.jit.si'}/external_api.js`;
      script.async = true;
      script.onload = initJitsi;
      document.body.appendChild(script);
    } else {
      initJitsi();
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [roomInfo, navigate]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', color: '#f8fafc' }}>
      <header style={{ padding: '12px 24px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Phòng Khám Trực Tuyến</h2>
          {roomInfo && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              Mã phòng: {code} | Vai trò: {roomInfo.role === 'doctor' ? 'Bác sĩ phụ trách' : 'Bệnh nhân'}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Rời phòng
        </button>
      </header>

      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '1.1rem' }}>Đang xác thực bảo mật và kết nối phòng khám...</p>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
            <div style={{ maxWidth: '500px', backgroundColor: '#1e293b', border: '1px solid #ef4444', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
              <h3 style={{ color: '#ef4444', marginTop: 0 }}>Không thể truy cập</h3>
              <p style={{ color: '#cbd5e1', marginBottom: '20px' }}>{error}</p>
              <button
                onClick={() => navigate('/')}
                style={{
                  padding: '8px 20px',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Về trang chủ
              </button>
            </div>
          </div>
        )}

        <div
          ref={jitsiContainerRef}
          style={{
            width: '100%',
            height: '100%',
            display: roomInfo && !error ? 'block' : 'none',
          }}
        />
      </div>
    </div>
  );
}
