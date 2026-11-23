import type { LatLng, ProductCategory, ScamReason } from '../types/marketplace.ts';

export const ZAMBIA_PROVINCES: Record<string, string[]> = {
  Lusaka: ['Lusaka', 'Chongwe', 'Kafue', 'Chilanga', 'Luangwa', 'Rufunsa'],
  Copperbelt: ['Ndola', 'Kitwe', 'Chingola', 'Mufulira', 'Luanshya', 'Mpongwe', 'Masaiti', 'Chililabombwe'],
  Central: ['Kabwe', 'Mkushi', 'Chibombo', 'Chisamba', 'Kapiri Mposhi', 'Mumbwa', 'Serenje'],
  Southern: ['Choma', 'Mazabuka', 'Livingstone', 'Monze', 'Kalomo', 'Siavonga', 'Sinazongwe'],
  Eastern: ['Chipata', 'Petauke', 'Katete', 'Lundazi', 'Mambwe', 'Nyimba'],
  Northern: ['Kasama', 'Mbala', 'Luwingu', 'Mporokoso', 'Mpulungu', 'Mungwi'],
  Luapula: ['Mansa', 'Samfya', 'Kawambwa', 'Nchelenge', 'Mwense', 'Chienge'],
  Muchinga: ['Chinsali', 'Mpika', 'Nakonde', 'Isoka', 'Mafinga'],
  'North-Western': ['Solwezi', 'Mwinilunga', 'Kasempa', 'Zambezi', 'Kabompo', 'Kalumbila'],
  Western: ['Mongu', 'Kaoma', 'Senanga', 'Sesheke', 'Kalabo', 'Lukulu'],
};

export const ZAMBIA_CENTER: LatLng = { lat: -13.1339, lng: 27.8493 };

export const PROVINCE_COORDINATES: Record<string, LatLng> = {
  Lusaka: { lat: -15.3875, lng: 28.3228 },
  Copperbelt: { lat: -12.8024, lng: 28.2132 },
  Central: { lat: -14.4469, lng: 28.4464 },
  Southern: { lat: -16.8089, lng: 26.9875 },
  Eastern: { lat: -13.6333, lng: 32.65 },
  Northern: { lat: -10.2129, lng: 31.1808 },
  Luapula: { lat: -11.1998, lng: 28.8943 },
  Muchinga: { lat: -10.5414, lng: 32.0816 },
  'North-Western': { lat: -12.1688, lng: 26.3894 },
  Western: { lat: -15.2796, lng: 23.1319 },
};

export const DISTRICT_COORDINATES: Record<string, LatLng> = {
  Lusaka: { lat: -15.3875, lng: 28.3228 },
  Chongwe: { lat: -15.3292, lng: 28.6821 },
  Kafue: { lat: -15.7691, lng: 28.1814 },
  Chilanga: { lat: -15.5453, lng: 28.2738 },
  Luangwa: { lat: -15.6167, lng: 30.4167 },
  Rufunsa: { lat: -15.0833, lng: 29.65 },
  Ndola: { lat: -12.9587, lng: 28.6366 },
  Kitwe: { lat: -12.8024, lng: 28.2132 },
  Chingola: { lat: -12.5289, lng: 27.8838 },
  Mufulira: { lat: -12.5498, lng: 28.2407 },
  Luanshya: { lat: -13.1367, lng: 28.4166 },
  Mpongwe: { lat: -13.5091, lng: 28.155 },
  Masaiti: { lat: -13.2389, lng: 28.4972 },
  Chililabombwe: { lat: -12.3647, lng: 27.8229 },
  Kabwe: { lat: -14.4469, lng: 28.4464 },
  Mkushi: { lat: -13.6202, lng: 29.3939 },
  Chibombo: { lat: -14.6569, lng: 28.0706 },
  Chisamba: { lat: -14.9833, lng: 28.3833 },
  'Kapiri Mposhi': { lat: -13.9715, lng: 28.6699 },
  Mumbwa: { lat: -14.9829, lng: 27.0619 },
  Serenje: { lat: -13.2325, lng: 30.2352 },
  Choma: { lat: -16.8089, lng: 26.9875 },
  Mazabuka: { lat: -15.856, lng: 27.748 },
  Livingstone: { lat: -17.8419, lng: 25.8542 },
  Monze: { lat: -16.2833, lng: 27.4833 },
  Kalomo: { lat: -17.0247, lng: 26.4894 },
  Siavonga: { lat: -16.5382, lng: 28.7088 },
  Sinazongwe: { lat: -17.2614, lng: 27.4618 },
  Chipata: { lat: -13.6333, lng: 32.65 },
  Petauke: { lat: -14.2412, lng: 31.3204 },
  Katete: { lat: -14.0596, lng: 32.0442 },
  Lundazi: { lat: -12.2929, lng: 33.1782 },
  Mambwe: { lat: -13.1056, lng: 31.9261 },
  Nyimba: { lat: -14.5566, lng: 30.8149 },
  Kasama: { lat: -10.2129, lng: 31.1808 },
  Mbala: { lat: -8.8402, lng: 31.3659 },
  Luwingu: { lat: -10.2621, lng: 29.9271 },
  Mporokoso: { lat: -9.3727, lng: 30.125 },
  Mpulungu: { lat: -8.7623, lng: 31.114 },
  Mungwi: { lat: -10.1732, lng: 31.3694 },
  Mansa: { lat: -11.1998, lng: 28.8943 },
  Samfya: { lat: -11.3649, lng: 29.5565 },
  Kawambwa: { lat: -9.7915, lng: 29.0791 },
  Nchelenge: { lat: -9.3451, lng: 28.734 },
  Mwense: { lat: -10.3845, lng: 28.698 },
  Chienge: { lat: -8.65, lng: 29.15 },
  Chinsali: { lat: -10.5414, lng: 32.0816 },
  Mpika: { lat: -11.8343, lng: 31.4529 },
  Nakonde: { lat: -9.3421, lng: 32.745 },
  Isoka: { lat: -10.1606, lng: 32.6335 },
  Mafinga: { lat: -10.25, lng: 33.25 },
  Solwezi: { lat: -12.1688, lng: 26.3894 },
  Mwinilunga: { lat: -11.7358, lng: 24.4293 },
  Kasempa: { lat: -13.4584, lng: 25.8338 },
  Zambezi: { lat: -13.5432, lng: 23.1047 },
  Kabompo: { lat: -13.5927, lng: 24.2008 },
  Kalumbila: { lat: -12.248, lng: 25.379 },
  Mongu: { lat: -15.2796, lng: 23.1319 },
  Kaoma: { lat: -14.7833, lng: 24.8 },
  Senanga: { lat: -16.1167, lng: 23.2667 },
  Sesheke: { lat: -17.4759, lng: 24.2968 },
  Kalabo: { lat: -14.97, lng: 22.6814 },
  Lukulu: { lat: -14.3707, lng: 23.242 },
};

export function getDistrictCoordinates(province: string, district: string): LatLng {
  return (
    DISTRICT_COORDINATES[district] ||
    PROVINCE_COORDINATES[province] ||
    ZAMBIA_CENTER
  );
}

export const PROVINCE_NAMES = Object.keys(ZAMBIA_PROVINCES);

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Crops & Grains',
  'Horticulture',
  'Livestock',
  'Poultry',
  'Fisheries & Aquaculture',
  'Agro-Inputs',
  'Farm Equipment',
];

export const SCAM_REASONS: ScamReason[] = [
  'Requested upfront deposit before delivery',
  'Fake or stolen photos',
  'Non-existent produce',
  'Misleading location or price',
];

export const VERIFICATION_LABELS: Record<string, string> = {
  unverified: 'Pending Verification',
  tier1_id: 'ID Verified',
  tier2_business: 'Verified Business',
  tier3_site: 'Site-Verified',
};
