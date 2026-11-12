/**
 * Public DTO Serializer for Doctor profiles.
 * Strips all internal, administrative, and PII fields (email, phoneNumber, password, etc.).
 *
 * Exposes ONLY:
 * - id
 * - fullName
 * - specialtyId
 * - specialtyName
 * - degree
 * - description
 * - experience
 * - consultationFee
 * - isVip
 * - avatarUrl
 * - averageRating / rating
 */

function toPublicDoctor(doctor, { rating = null } = {}) {
  if (!doctor) return null;
  const raw = typeof doctor.toJSON === 'function' ? doctor.toJSON() : { ...doctor };

  const parsedRating =
    rating !== null && rating !== undefined
      ? Number(rating)
      : raw.averageRating !== undefined && raw.averageRating !== null
        ? Number(raw.averageRating)
        : raw.rating !== undefined && raw.rating !== null
          ? Number(raw.rating)
          : null;

  return {
    id: raw.id,
    fullName: raw.fullName || '',
    specialtyId: raw.specialtyId ?? null,
    specialtyName: raw.specialtyName ?? null,
    degree: raw.degree ?? null,
    description: raw.description ?? null,
    experience: raw.experience ?? null,
    consultationFee:
      raw.consultationFee !== undefined && raw.consultationFee !== null
        ? Number(raw.consultationFee)
        : null,
    isVip: Boolean(raw.isVip),
    avatarUrl: raw.avatarUrl || raw.profileImage || raw.imageUrl || raw.photoUrl || null,
    rating: Number.isFinite(parsedRating) ? Number(parsedRating.toFixed(1)) : null,
    averageRating: Number.isFinite(parsedRating) ? Number(parsedRating.toFixed(1)) : null,
  };
}

module.exports = {
  toPublicDoctor,
};
