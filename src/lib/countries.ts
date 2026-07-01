export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
  taxLabel: string;
  phoneCode: string;
  timezone: string;
}

export const COUNTRIES: Country[] = [
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', currency: 'PKR', taxLabel: 'GST/NTN', phoneCode: '+92', timezone: 'Asia/Karachi' },
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'INR', taxLabel: 'GST', phoneCode: '+91', timezone: 'Asia/Kolkata' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', currency: 'BDT', taxLabel: 'VAT', phoneCode: '+880', timezone: 'Asia/Dhaka' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', currency: 'AED', taxLabel: 'VAT', phoneCode: '+971', timezone: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', currency: 'SAR', taxLabel: 'VAT', phoneCode: '+966', timezone: 'Asia/Riyadh' },
  { code: 'US', name: 'USA', flag: '🇺🇸', currency: 'USD', taxLabel: 'Sales Tax', phoneCode: '+1', timezone: 'America/New_York' },
  { code: 'GB', name: 'UK', flag: '🇬🇧', currency: 'GBP', taxLabel: 'VAT', phoneCode: '+44', timezone: 'Europe/London' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', currency: 'LKR', taxLabel: 'VAT', phoneCode: '+94', timezone: 'Asia/Colombo' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', taxLabel: 'VAT', phoneCode: '+234', timezone: 'Africa/Lagos' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', currency: 'TRY', taxLabel: 'KDV', phoneCode: '+90', timezone: 'Europe/Istanbul' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', currency: 'MYR', taxLabel: 'SST', phoneCode: '+60', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'SGD', taxLabel: 'GST', phoneCode: '+65', timezone: 'Asia/Singapore' },
];

export const getCountryByCode = (code: string): Country | undefined => {
  return COUNTRIES.find(c => c.code === code);
};
