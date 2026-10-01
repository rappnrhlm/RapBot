function normalizePhoneNumber(number) {
    if (!number) return '';
    let phone = String(number).replace(/\D/g, '');
    if (phone.startsWith('0')) {
        phone = '62' + phone.slice(1);
    }
    return phone;
}

function maskNumber(number) {
    const phone = normalizePhoneNumber(number);
    if (phone.length < 8) return phone;
    return phone.slice(0, 4) + 'xxxxxx' + phone.slice(-2);
}

module.exports = {
    normalizePhoneNumber,
    maskNumber
};
