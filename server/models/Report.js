const mongoose = require('mongoose');
const { REPORT_TYPES, STATUSES } = require('../constants');

const reportSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true, maxlength: 200 },
    location: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    reportType: { type: String, enum: REPORT_TYPES, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    // What the client says the map showed when the user reported
    appResult: {
      zones: { type: String, maxlength: 100, default: '' },
      oddHit: { type: Boolean, default: false },
      evenHit: { type: Boolean, default: false }
    },
    status: { type: String, enum: STATUSES, default: 'new' }
  },
  { timestamps: true } // adds createdAt and updatedAt, set by the server
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ location: '2dsphere' }); // optional: enables "reports near here" queries

module.exports = mongoose.model('Report', reportSchema);