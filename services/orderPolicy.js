const MIN_BOOKING_LEAD_MINUTES = 60;
const ACCEPTANCE_CUTOFF_MINUTES = 30;
const ONLINE_ONLY_WINDOW_MINUTES = 120;
const EARLY_START_MINUTES = 15;

const minutesUntil = (date, now = new Date()) => (new Date(date).getTime() - now.getTime()) / 60000;

function canCreateBooking(startDatetime, now = new Date()) {
    return minutesUntil(startDatetime, now) >= MIN_BOOKING_LEAD_MINUTES;
}

function canClaimOrder(startDatetime, now = new Date()) {
    return minutesUntil(startDatetime, now) > ACCEPTANCE_CUTOFF_MINUTES;
}

function requiresOnlinePayment(startDatetime, now = new Date()) {
    return minutesUntil(startDatetime, now) <= ONLINE_ONLY_WINDOW_MINUTES;
}

function canStartOrder(startDatetime, now = new Date()) {
    return minutesUntil(startDatetime, now) <= EARLY_START_MINUTES;
}

module.exports = {
    MIN_BOOKING_LEAD_MINUTES,
    ACCEPTANCE_CUTOFF_MINUTES,
    ONLINE_ONLY_WINDOW_MINUTES,
    EARLY_START_MINUTES,
    canCreateBooking,
    canClaimOrder,
    requiresOnlinePayment,
    canStartOrder
};
