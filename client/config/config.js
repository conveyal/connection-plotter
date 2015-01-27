module.exports = {
  /** The url of the OTP REST API */
  otpServer: 'http://localhost:8080/otp',
  mapWidth: "1280px",
  mapHeight: "960px",

  /** walking speed, meters/second */
  walkingSpeed: 1.333,

  /** minumum transfer time, seconds */
  minTransferTime: 2 * 60,

  /** maximum transfer time before this is no longer considered a transfer, in seconds */
  // 90 minutes
  maxTransferTime: 60 * 90
};
