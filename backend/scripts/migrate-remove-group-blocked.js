/**
 * Migration Script: migrate-remove-group-blocked.js
 *
 * Idempotent migration script to:
 * 1. Convert DoctorShifts currently with status 'GROUP_BLOCKED' back to 'ACTIVE'.
 * 2. Unlock any slots blocked by group health back to 'AVAILABLE' (if not booked).
 * 3. Drop legacy group health collections & GridFS files.
 *
 * Supports --dry-run mode.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('[Migration] Error: Missing MONGO_URI / MONGODB_URI in environment.');
    process.exit(1);
  }

  console.log(`[Migration] Connecting to database... (mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'})`);
  await mongoose.connect(uri);

  try {
    const db = mongoose.connection.db;
    const shiftCol = db.collection('doctorshifts');

    // 1. Inspect GROUP_BLOCKED shifts
    const groupBlockedShifts = await shiftCol.find({ status: 'GROUP_BLOCKED' }).toArray();
    console.log(`[Inspection] DoctorShifts currently GROUP_BLOCKED: ${groupBlockedShifts.length}`);

    let totalSlotsToUnlock = 0;
    for (const shift of groupBlockedShifts) {
      const lockedSlots = (shift.slots || []).filter(
        (s) => s.status === 'CANCELLED' && !s.bookingRef
      );
      totalSlotsToUnlock += lockedSlots.length;
    }
    console.log(`[Inspection] Unbooked slots in GROUP_BLOCKED shifts that can be unlocked to AVAILABLE: ${totalSlotsToUnlock}`);

    // 2. Inspect collections to drop
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);
    const legacyCollections = [
      'grouphealthrequests',
      'grouphealthassignments',
      'groupHealth.files',
      'groupHealth.chunks',
    ].filter((name) => collectionNames.includes(name));

    console.log(`[Inspection] Legacy collections found: ${legacyCollections.join(', ') || 'None'}`);

    if (isDryRun) {
      console.log('\n[DRY-RUN SUMMARY]');
      console.log(`- DoctorShifts to transition GROUP_BLOCKED -> ACTIVE: ${groupBlockedShifts.length}`);
      console.log(`- Slots to unlock CANCELLED -> AVAILABLE: ${totalSlotsToUnlock}`);
      console.log(`- Collections to drop: ${legacyCollections.length}`);
      console.log('[DRY-RUN COMPLETE] No database modifications were made.');
      return;
    }

    // LIVE EXECUTION
    console.log('\n[LIVE EXECUTION] Applying changes...');

    // A. Update shifts
    if (groupBlockedShifts.length > 0) {
      const updateResult = await shiftCol.updateMany(
        { status: 'GROUP_BLOCKED' },
        {
          $set: {
            status: 'ACTIVE',
            updatedAt: new Date(),
          },
        }
      );
      console.log(`[Live] Shifts updated to ACTIVE: ${updateResult.modifiedCount}`);

      // Unlock slots
      for (const shift of groupBlockedShifts) {
        await shiftCol.updateOne(
          { _id: shift._id },
          {
            $set: {
              'slots.$[elem].status': 'AVAILABLE',
            },
          },
          {
            arrayFilters: [{ 'elem.status': 'CANCELLED', 'elem.bookingRef': null }],
          }
        );
      }
      console.log(`[Live] Slots unlocked to AVAILABLE.`);
    }

    // B. Drop collections
    for (const col of legacyCollections) {
      await db.collection(col).drop();
      console.log(`[Live] Dropped collection: ${col}`);
    }

    console.log('[Live] Migration completed successfully.');
  } finally {
    await mongoose.disconnect();
    console.log('[Migration] Disconnected from database.');
  }
}

run().catch((err) => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});

