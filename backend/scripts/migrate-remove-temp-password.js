const mongoose = require('mongoose');
const { User } = require('../src/models');
const env = require('../src/config/env');

async function migrate() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[Migration] migrate-remove-temp-password starting (dryRun: ${isDryRun})...`);

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.mongoUri);
  }

  const query = {
    $or: [
      { temporaryPassword: { $exists: true } },
      { temporaryPasswordExpiresAt: { $exists: true } },
    ],
  };

  const count = await User.countDocuments(query);
  console.log(`[Migration] Found ${count} user record(s) with legacy temporaryPassword fields.`);

  if (!isDryRun && count > 0) {
    const result = await User.updateMany(query, {
      $unset: {
        temporaryPassword: '',
        temporaryPasswordExpiresAt: '',
      },
    });
    console.log(`[Migration] Successfully cleaned up legacy fields for ${result.modifiedCount} user(s).`);
  } else if (isDryRun) {
    console.log('[Migration] Dry run completed. No data was modified.');
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('[Migration Error]:', err);
    process.exit(1);
  });
}

module.exports = migrate;

