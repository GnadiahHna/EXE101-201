const crypto = require('crypto');

/**
 * Jitsi Meet Video Provider Abstraction.
 * Computes deterministic HMAC room name from meeting.code to keep public rooms obscure.
 */
class JitsiVideoProvider {
  constructor(secretKey = 'jitsi_room_secret_salt_12345') {
    this.secretKey = secretKey;
    this.domain = 'meet.jit.si';
  }

  generateRoomName(meetingCode) {
    if (!meetingCode) {
      throw new Error('meetingCode is required to generate video room name');
    }
    // Deterministic HMAC hash ensuring rooms remain consistent between doctor & patient
    const hmac = crypto.createHmac('sha256', this.secretKey).update(String(meetingCode)).digest('hex').slice(0, 16);
    return `NanoClinic_${hmac}`;
  }

  getEmbedUrl(meetingCode, userInfo = {}) {
    const room = this.generateRoomName(meetingCode);
    const params = new URLSearchParams({
      'userInfo.displayName': userInfo.displayName || 'Bệnh nhân',
    });
    return `https://${this.domain}/${room}#${params.toString()}`;
  }
}

const defaultVideoProvider = new JitsiVideoProvider();

module.exports = {
  JitsiVideoProvider,
  defaultVideoProvider,
};
