export interface ExtractionResult {
  id?: string;
  fileName: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  data?: ExtractedData;
  error?: string;
  confidence_score?: number;
  image_quality_score?: number;
  file?: File;
  downloadURL?: string;
}

export interface ExtractedData {
  employer: string;
  lastName: string;
  firstName: string;
  idNumber: string;
  gender: string;
  dateOfBirth: string;
  email: string;
  city: string;
  street: string;
  houseNumber: string;
  mobilePhone: string;
  siteBranch: string;
  role: string;
  is_not_member_other_org: boolean;
  is_member_other_org: boolean;
  other_org_name: string;
  declaration_direct_mail: boolean;
  date: string;
  is_signed: boolean;
  confidence_score: number;
  image_quality_score: number;
  low_confidence_fields: string[];
  field_coordinates?: Record<string, [number, number, number, number]>; // [ymin, xmin, ymax, xmax] normalized 0-1000
}
