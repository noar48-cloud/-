import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Download, 
  ChevronRight, 
  AlertCircle,
  Key,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Save,
  ArrowRight,
  ArrowLeft,
  Search,
  Check,
  ChevronLeft,
  X,
  Edit2,
  Trash2,
  LogIn,
  LogOut,
  Lock,
  Users,
  User as UserIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, deleteDoc, doc, getDocs, query, where, writeBatch, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { jsPDF } from "jspdf";
import { GoogleGenAI, Type } from "@google/genai";
import { Toaster, toast } from 'sonner';

const googleProvider = new GoogleAuthProvider();

// Error Boundary Component
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  props: { children: React.ReactNode };
  state: { hasError: boolean, error: any } = { hasError: false, error: null };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "משהו השתבש. אנא נסה לרענן את הדף.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `שגיאת מערכת: ${parsedError.error}`;
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6 text-right" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">אופס! שגיאה</h1>
            <p className="text-gray-600 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-medium hover:bg-[#4A4A30] transition-colors"
            >
              רענן דף
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
import { cn } from './lib/utils';
import { ExtractionResult, ExtractedData } from './types';

// Extend window for AI Studio key selection
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const SYSTEM_INSTRUCTION = `חלץ נתונים מטופס הצטרפות להסתדרות הלאומית בדיוק מקסימלי.
חוקים:
1. אל תנחש: אם שדה לא ברור, רשום 'לא קריא'.
2. טלפון: 10 ספרות, ללא תווים. הוסף 0 אם מתחיל ב-5.
3. ת"ז: 9 ספרות בלבד.
4. הצהרת אי חברות: חובה לבחור בדיוק אחת: או "לא חבר" (is_not_member_other_org) או "חבר בארגון אחר" (is_member_other_org). אם נבחר "חבר בארגון אחר", חובה לציין את שם הארגון ב-other_org_name (למשל: כללית, כוח לעובדים, או שם אחר שצוין).
5. קואורדינטות: חובה לכל שדה בפורמט [ymin, xmin, ymax, xmax] (ערכים 0-1000).
6. דיוור ישיר: חלץ את הסכמת המשתמש לדיוור ישיר (declaration_direct_mail) כערך בוליאני.
7. חתימה: בדוק אם קיימת חתימה פיזית בטופס (is_signed) כערך בוליאני.
8. קואורדינטות: חובה לכל שדה בפורמט [ymin, xmin, ymax, xmax] (ערכים 0-1000).`;

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    employer: { type: Type.STRING, description: "שם המעסיק" },
    lastName: { type: Type.STRING, description: "שם משפחה" },
    firstName: { type: Type.STRING, description: "שם פרטי" },
    idNumber: { type: Type.STRING, description: "תעודת זהות (9 ספרות או 'לא קריא')" },
    gender: { type: Type.STRING, description: "מין" },
    dateOfBirth: { type: Type.STRING, description: "תאריך לידה" },
    email: { type: Type.STRING, description: "אימייל" },
    city: { type: Type.STRING, description: "עיר" },
    street: { type: Type.STRING, description: "רחוב" },
    houseNumber: { type: Type.STRING, description: "מספר בית" },
    mobilePhone: { type: Type.STRING, description: "טלפון נייד (10 ספרות)" },
    siteBranch: { type: Type.STRING, description: "סניף/אתר" },
    role: { type: Type.STRING, description: "תפקיד" },
    is_not_member_other_org: { type: Type.BOOLEAN, description: "לא חבר באף ארגון אחר" },
    is_member_other_org: { type: Type.BOOLEAN, description: "חבר בארגון עובדים אחר" },
    other_org_name: { type: Type.STRING, description: "שם הארגון האחר (אם קיים)" },
    declaration_direct_mail: { type: Type.BOOLEAN, description: "הסכמה לדיוור ישיר" },
    date: { type: Type.STRING, description: "תאריך החתימה" },
    is_signed: { type: Type.BOOLEAN, description: "האם קיים חתימה פיזית" },
    confidence_score: { type: Type.NUMBER, description: "ציון ביטחון בפענוח (0-100)" },
    image_quality_score: { type: Type.NUMBER, description: "מדד איכות התמונה (0-100)" },
    low_confidence_fields: { type: Type.ARRAY, items: { type: Type.STRING }, description: "רשימת שדות שהמערכת לא בטוחה לגביהם" },
    field_coordinates: { 
      type: Type.OBJECT, 
      description: "מפת קואורדינטות לכל שדה [ymin, xmin, ymax, xmax]",
      properties: {
        employer: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        lastName: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        firstName: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        idNumber: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        gender: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        dateOfBirth: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        email: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        city: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        street: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        houseNumber: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        mobilePhone: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        siteBranch: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        role: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        is_not_member_other_org: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        is_member_other_org: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        other_org_name: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        declaration_direct_mail: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        date: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        is_signed: { type: Type.ARRAY, items: { type: Type.NUMBER } }
      },
      required: [
        "employer", "lastName", "firstName", "idNumber", "mobilePhone", "dateOfBirth"
      ]
    }
  },
  required: [
    "employer", "lastName", "firstName", "idNumber", "gender", 
    "dateOfBirth", "email", "city", "street", "houseNumber", 
    "mobilePhone", "siteBranch", "role", "is_not_member_other_org", 
    "is_member_other_org", "other_org_name", "declaration_direct_mail", 
    "date", "is_signed", "confidence_score", "image_quality_score", "low_confidence_fields"
  ]
};

const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return () => unsubscribe();
  }, []);

  const handleStatusChange = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'users', userId), { status });
      toast.success(`המשתמש ${status === 'approved' ? 'אושר' : 'נדחה'} בהצלחה`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#5A5A40] text-white">
          <div>
            <h2 className="text-xl font-bold">ניהול גישות משתמשים</h2>
            <p className="text-xs opacity-80 mt-1">כדי שמשתמשים יוכלו לעבוד ללא הזנת מפתח, וודא שהגדרת מפתח API בהגדרות האתר (Environment Variables)</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" /></div>
          ) : pendingUsers.length === 0 ? (
            <div className="text-center p-12 text-gray-500">אין בקשות הצטרפות ממתינות</div>
          ) : (
            <div className="space-y-4">
              {pendingUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200">
                  <div className="flex items-center gap-4">
                    {u.photoURL ? (
                      <img src={u.photoURL} className="w-10 h-10 rounded-full" alt="" />
                    ) : (
                      <div className="w-10 h-10 bg-[#5A5A40]/10 rounded-full flex items-center justify-center text-[#5A5A40] font-bold">
                        {u.displayName?.[0] || u.email[0]}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-gray-800">{u.displayName || 'משתמש ללא שם'}</div>
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleStatusChange(u.id, 'approved')}
                      className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-all"
                    >
                      אשר
                    </button>
                    <button 
                      onClick={() => handleStatusChange(u.id, 'rejected')}
                      className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-all"
                    >
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const heToEnMap: Record<string, string> = {
  'ק': 'e', 'ר': 'r', 'א': 't', 'ט': 'y', 'ו': 'u', 'ן': 'i', 'ם': 'o', 'פ': 'p',
  'ש': 'a', 'ד': 's', 'ג': 'd', 'כ': 'f', 'ע': 'g', 'י': 'h', 'ח': 'j', 'ל': 'k', 'ך': 'l',
  'ז': 'z', 'ס': 'x', 'ב': 'c', 'ה': 'v', 'נ': 'b', 'מ': 'n', 'צ': 'm',
  'ף': ';', 'ץ': '.', 'ת': ','
};

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [editingResultIndex, setEditingResultIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<keyof ExtractedData | null>(null);
  const [manualValue, setManualValue] = useState<string>('');
  const [showDetailsView, setShowDetailsView] = useState(false);
  const [detailsResultIndex, setDetailsResultIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    if (containerRef.current && showDetailsView) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current && showDetailsView) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const [zoom, setZoom] = useState(1.0);
  const [overlayFontSize, setOverlayFontSize] = useState(() => {
    const saved = localStorage.getItem('layoutTemplate');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.fontSize || 11;
    }
    return 11;
  });
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [layoutTemplate, setLayoutTemplate] = useState<{
    coords: Record<string, number[]>;
    zoom: number;
    fontSize?: number;
    initialScrollTop?: number;
    initialScrollLeft?: number;
  } | null>(() => {
    const saved = localStorage.getItem('layoutTemplate');
    return saved ? JSON.parse(saved) : null;
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<{
    email: string;
    role: 'admin' | 'user';
    status: 'approved' | 'pending' | 'rejected';
  } | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [focusedField, setFocusedField] = useState<keyof ExtractedData | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextScrollRef = useRef(false);

  // Auto-focus first field when opening details view
  useEffect(() => {
    if (showDetailsView && detailsResultIndex !== null) {
      skipNextScrollRef.current = true;
      setTimeout(() => {
        const firstInput = document.querySelector('input[name="employer"]') as HTMLInputElement;
        if (firstInput) {
          // Use preventScroll to keep the view at the top
          firstInput.focus({ preventScroll: true });
          firstInput.select();
        }
        // Allow subsequent scrolls after a short delay
        setTimeout(() => {
          skipNextScrollRef.current = false;
        }, 1000);
      }, 400);
    }
  }, [showDetailsView, detailsResultIndex]);

  // Fit to frame logic - Adjusted to use saved initial scroll if available
  useEffect(() => {
    if (showDetailsView && containerRef.current) {
      if (layoutTemplate?.initialScrollTop !== undefined) {
        setZoom(layoutTemplate.zoom);
        setOverlayFontSize(layoutTemplate.fontSize || 11);
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTo({ 
              top: layoutTemplate.initialScrollTop, 
              left: layoutTemplate.initialScrollLeft || 0,
              behavior: 'smooth' 
            });
          }
        }, 500);
      } else {
        setZoom(1.0); // Default zoom to 100%
        // Don't set focusedField immediately to allow starting at the top
        setTimeout(() => {
          if (containerRef.current) {
            const container = containerRef.current;
            const imgWrapper = container.querySelector('.relative.bg-white.shadow-2xl') as HTMLElement;
            if (imgWrapper) {
              // Center horizontally
              const left = (imgWrapper.offsetWidth - container.offsetWidth) / 2;
              container.scrollTo({ top: 0, left: Math.max(0, left), behavior: 'smooth' });
            } else {
              container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            }
          }
          // Focus employer after a delay so the scroll to top is visible/primary
          setTimeout(() => {
            setFocusedField('employer');
          }, 600);
        }, 400);
      }
    } else if (!showDetailsView) {
      setFocusedField(null);
    }
  }, [showDetailsView]);

  // Scroll to focused field
  useEffect(() => {
    // Only scroll to field if it's not the initial focus right after opening
    if (showDetailsView && focusedField && containerRef.current && detailsResultIndex !== null && !skipNextScrollRef.current) {
      const result = results[detailsResultIndex];
      const coords = result.data?.field_coordinates?.[focusedField];
      
      // Special case for bottom fields
      const isBottomField = ['date', 'is_signed'].includes(focusedField);
      
      if (isBottomField && containerRef.current) {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        return;
      }

      if (coords) {
        const container = containerRef.current;
        const imgWrapper = container.querySelector('.relative.bg-white.shadow-2xl') as HTMLElement;
        if (imgWrapper) {
          // Coords are 0-1000
          const centerY = (coords[0] + coords[2]) / 2 / 1000;
          const centerX = (coords[1] + coords[3]) / 2 / 1000;
          
          const targetX = centerX * imgWrapper.offsetWidth - container.clientWidth / 2;
          const targetY = centerY * imgWrapper.offsetHeight - container.clientHeight / 2;
          
          container.scrollTo({
            left: Math.max(0, targetX),
            top: Math.max(0, targetY),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [focusedField, showDetailsView, detailsResultIndex, zoom]);

  // Save template to localStorage for immediate persistence
  useEffect(() => {
    if (layoutTemplate) {
      localStorage.setItem('layoutTemplate', JSON.stringify(layoutTemplate));
    }
  }, [layoutTemplate]);

  // Load template from Firebase on login
  useEffect(() => {
    if (user) {
      const loadTemplate = async () => {
        try {
          const q = query(collection(db, 'templates'), where('userId', '==', user.uid));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const data = querySnapshot.docs[0].data();
            setLayoutTemplate({
              coords: data.coords,
              zoom: data.zoom || 1,
              fontSize: data.fontSize || 11,
              initialScrollTop: data.initialScrollTop,
              initialScrollLeft: data.initialScrollLeft
            });
            setZoom(data.zoom || 1);
            setOverlayFontSize(data.fontSize || 11);
            toast.success('תבנית נטענה מהענן');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'templates');
        }
      };
      loadTemplate();
    }
  }, [user]);

  const saveTemplateToFirebase = async (coords: Record<string, number[]>, currentZoom: number, currentFontSize: number) => {
    if (!user) {
      toast.error('יש להתחבר כדי לשמור תבנית בענן');
      return;
    }

    const initialScrollTop = containerRef.current?.scrollTop || 0;
    const initialScrollLeft = containerRef.current?.scrollLeft || 0;

    try {
      const q = query(collection(db, 'templates'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      const templateData = {
        userId: user.uid,
        coords,
        zoom: currentZoom,
        fontSize: currentFontSize,
        initialScrollTop,
        initialScrollLeft,
        updatedAt: serverTimestamp()
      };

      if (!querySnapshot.empty) {
        // Update existing
        const docRef = doc(db, 'templates', querySnapshot.docs[0].id);
        await updateDoc(docRef, templateData);
      } else {
        // Create new
        await addDoc(collection(db, 'templates'), {
          ...templateData,
          createdAt: serverTimestamp()
        });
      }

      setLayoutTemplate({
        coords,
        zoom: currentZoom,
        fontSize: currentFontSize,
        initialScrollTop,
        initialScrollLeft
      });

      toast.success('התבנית נשמרה בענן (כולל מיקום גלילה התחלתי)');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'templates');
    }
  };
  const [pan, setPan] = useState({ x: 50, y: 50 }); // Percentage center
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setIsCheckingAccess(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as any);
          } else {
            const isAdmin = u.email === 'noar48@gmail.com';
            const newProfile = {
              email: u.email || '',
              role: isAdmin ? 'admin' : 'user',
              status: isAdmin ? 'approved' : 'pending',
              displayName: u.displayName || '',
              photoURL: u.photoURL || '',
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'users', u.uid), newProfile);
            setUserProfile(newProfile as any);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        } finally {
          setIsCheckingAccess(false);
        }
      } else {
        setUserProfile(null);
        setIsCheckingAccess(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditingLayout) {
        setIsEditingLayout(false);
        toast.info('עריכת שכבה הסתיימה');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditingLayout]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('התחברות בוטלה - החלון נסגר לפני סיום התהליך. אנא וודא שחלונות קופצים (Popups) מאושרים בדפדפן.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore multiple clicks
      } else {
        toast.error('שגיאה בהתחברות: ' + (error.message || 'שגיאה לא ידועה'));
      }
    }
  };

  useEffect(() => {
    if (editingResultIndex !== null && editingField) {
      const result = results[editingResultIndex];
      const coords = result.data?.field_coordinates?.[editingField];
      if (coords) {
        // [ymin, xmin, ymax, xmax]
        const centerY = (coords[0] + coords[2]) / 2 / 10;
        const centerX = (coords[1] + coords[3]) / 2 / 10;
        
        setPan({ x: centerX, y: centerY });
        setZoom(8); // Auto zoom in to 800%
        setDragOffset({ x: 0, y: 0 }); // Reset drag on field change
        
        // Focus and select text after a short delay to ensure DOM is ready
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 100);
      } else {
        setPan({ x: 50, y: 50 });
        setZoom(1);
        setDragOffset({ x: 0, y: 0 });
      }
    }
  }, [editingField, editingResultIndex]);

  const isValidIsraeliID = (id: string) => {
    const idStr = id.trim();
    if (!/^\d{5,9}$/.test(idStr)) return false;
    const paddedId = idStr.padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let num = Number(paddedId[i]) * ((i % 2) + 1);
      if (num > 9) num -= 9;
      sum += num;
    }
    return sum % 10 === 0;
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      employer: 'מעסיק',
      lastName: 'שם משפחה',
      firstName: 'שם פרטי',
      idNumber: 'תעודת זהות',
      gender: 'מין',
      dateOfBirth: 'תאריך לידה',
      email: 'אימייל',
      city: 'עיר',
      street: 'רחוב',
      houseNumber: 'מספר בית',
      mobilePhone: 'טלפון נייד',
      siteBranch: 'סניף/אתר',
      role: 'תפקיד',
      is_not_member_other_org: 'לא חבר בארגון אחר',
      is_member_other_org: 'חבר בארגון אחר',
      other_org_name: 'שם ארגון אחר',
      declaration_direct_mail: 'דיוור ישיר',
      date: 'תאריך',
      is_signed: 'חתום'
    };
    return labels[field] || field;
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    // If we have an environment key, we don't need to ask the user
    if (process.env.GEMINI_API_KEY || process.env.API_KEY) {
      setHasKey(true);
      return;
    }
    
    // If we are not in AI Studio (e.g. deployed app), we assume the key is handled by the environment
    if (!window.aistudio) {
      setHasKey(true);
      return;
    }

    try {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    } catch (e) {
      // If something goes wrong, default to true to allow the app to try and use the environment key
      setHasKey(true);
    }
  };

  const handleSelectKey = async () => {
    await window.aistudio.openSelectKey();
    setHasKey(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const logEvent = async (type: string, fileName?: string, details?: any) => {
    if (!sessionId) return;
    const path = `sessions/${sessionId}/events`;
    try {
      await addDoc(collection(db, path), {
        sessionId,
        type,
        fileName: fileName || null,
        details: details || null,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, path);
    }
  };

  const createSession = async (fileCount: number) => {
    if (!user) return null;
    const path = 'sessions';
    try {
      const docRef = await addDoc(collection(db, path), {
        userId: user.uid,
        startTime: new Date().toISOString(),
        status: 'started',
        fileCount,
        completedCount: 0
      });
      setSessionId(docRef.id);
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, path);
      return null;
    }
  };

  const clearSessionData = async () => {
    if (!sessionId) return;
    const confirmClear = window.confirm('האם אתה בטוח שברצונך למחוק את כל נתוני המעקב מהדאטה-בייס? (הקבצים עצמם לא יימחקו)');
    if (!confirmClear) return;

    const path = `sessions/${sessionId}/events`;
    try {
      const batch = writeBatch(db);
      
      // Delete events
      const eventsSnapshot = await getDocs(collection(db, path));
      eventsSnapshot.forEach((d) => {
        batch.delete(d.ref);
      });
      
      // Delete session
      batch.delete(doc(db, 'sessions', sessionId));
      
      await batch.commit();
      setSessionId(null);
      toast.success('נתוני המעקב נמחקו בהצלחה');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };
  const addFiles = async (newFiles: File[]) => {
    const imageFiles = newFiles.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let sid = sessionId;
    if (!sid) {
      sid = await createSession(imageFiles.length) || null;
    }

    setFiles(prev => [...prev, ...imageFiles]);
    setResults(prev => [
      ...prev,
      ...imageFiles.map(f => ({
        fileName: f.name,
        status: 'pending' as const,
        file: f
      }))
    ]);

    if (sid) {
      imageFiles.forEach(f => {
        logEvent('file_selected', f.name, { sessionId: sid });
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files) {
        addFiles(Array.from(e.clipboardData.files));
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      toast.error('מפתח API חסר. אנא הגדר אותו בהגדרות המערכת (Secrets).');
      return;
    }
    
    setIsProcessing(true);
    
    for (let i = 0; i < results.length; i++) {
      if (results[i].status !== 'pending') continue;
      
      const currentFile = results[i].file;
      if (!currentFile) continue;

      setCurrentFileIndex(i);
      setResults(prev => prev.map((res, idx) => 
        idx === i ? { ...res, status: 'processing' } : res
      ));

      try {
        await logEvent('extraction_started', currentFile.name);
        const base64Data = await fileToBase64(currentFile);
        
        // Create a new instance for each call to ensure up-to-date key
        const ai = new GoogleGenAI({ apiKey: apiKey });
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              parts: [
                { text: "חלץ נתונים מהטופס." },
                { inlineData: { data: base64Data, mimeType: currentFile.type } }
              ]
            }
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: EXTRACTION_SCHEMA,
            temperature: 0
          }
        });

        const data = JSON.parse(response.text || "{}") as ExtractedData;
        await logEvent('extraction_completed', currentFile.name, { confidence: data.confidence_score });
        
        // Post-processing: Check for invalid ID and empty fields
        const lowConfidence = new Set(data.low_confidence_fields || []);
        
        // 1. Check ID Number
        if (data.idNumber && data.idNumber !== 'לא קריא') {
          if (!isValidIsraeliID(data.idNumber)) {
            lowConfidence.add('idNumber');
          }
        } else if (!data.idNumber) {
          lowConfidence.add('idNumber');
        }

        // 2. Check for empty fields (excluding boolean fields, other_org_name, email, and siteBranch)
        const fieldsToCheck = [
          'employer', 'lastName', 'firstName', 'idNumber', 'gender', 
          'dateOfBirth', 'city', 'street', 'houseNumber', 
          'mobilePhone', 'role', 'date'
        ];

        fieldsToCheck.forEach(field => {
          const value = data[field as keyof ExtractedData];
          if (value === undefined || value === null || value === '' || value === ' ') {
            lowConfidence.add(field);
          }
        });

        // 3. Check declarations
        if (!data.is_not_member_other_org && !data.is_member_other_org) {
          lowConfidence.add('is_not_member_other_org');
          lowConfidence.add('is_member_other_org');
        }
        if (data.is_member_other_org && (!data.other_org_name || data.other_org_name === '')) {
          lowConfidence.add('other_org_name');
        }

        data.low_confidence_fields = Array.from(lowConfidence);
        
        setResults(prev => prev.map((res, idx) => 
          idx === i ? { 
            ...res, 
            status: 'success', 
            data: layoutTemplate ? { ...data, field_coordinates: layoutTemplate.coords } : data, 
            confidence_score: data.confidence_score,
            image_quality_score: data.image_quality_score
          } : res
        ));
      } catch (error) {
        console.error(`Error processing ${currentFile.name}:`, error);
        toast.error(`שגיאה בעיבוד הקובץ ${currentFile.name}: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`);
        setResults(prev => prev.map((res, idx) => 
          idx === i ? { ...res, status: 'error', error: String(error) } : res
        ));
      }
    }
    
    setIsProcessing(false);
    setCurrentFileIndex(-1);
    toast.success('עיבוד הקבצים הסתיים');
  };

  const downloadExcel = () => {
    const successData = results
      .filter(r => r.status === 'success' && r.data)
      .map(r => ({
        'קובץ': r.fileName,
        'מעסיק': r.data?.employer,
        'שם משפחה': r.data?.lastName,
        'שם פרטי': r.data?.firstName,
        'תעודת זהות': r.data?.idNumber,
        'בדיקת תקינות ת"ז': '', // Placeholder for formula
        'מין': r.data?.gender,
        'תאריך לידה': r.data?.dateOfBirth,
        'אימייל': r.data?.email === 'לא קריא' ? '' : r.data?.email,
        'עיר': r.data?.city,
        'רחוב': r.data?.street,
        'מספר בית': r.data?.houseNumber,
        'טלפון נייד': r.data?.mobilePhone,
        'סניף/אתר': r.data?.siteBranch,
        'תפקיד': r.data?.role,
        'לא חבר באף ארגון': r.data?.is_not_member_other_org ? 'כן' : 'לא',
        'חבר בארגון אחר': r.data?.is_member_other_org ? 'כן' : 'לא',
        'שם ארגון אחר': r.data?.other_org_name,
        'הסכמה לדיוור': r.data?.declaration_direct_mail ? 'כן' : 'לא',
        'תאריך': r.data?.date,
        'חתום': r.data?.is_signed ? 'כן' : 'לא',
        'ציון ביטחון': r.data?.confidence_score,
        'איכות תמונה': r.data?.image_quality_score
      }));

    const ws = XLSX.utils.json_to_sheet(successData);
    
    // Add validation formulas
    successData.forEach((_, i) => {
      const row = i + 2;
      // Column E is idNumber, Column F is validation
      const idCell = `E${row}`;
      const formulaCell = `F${row}`;
      
      // We can't directly set complex Excel formulas that work in Google Sheets perfectly via json_to_sheet easily
      // but we can set the cell value to the formula string.
      ws[formulaCell] = { 
        f: `IF(${idCell}="לא קריא", FALSE, MOD(SUMPRODUCT(MID(TEXT(${idCell},"000000000"),{1,2,3,4,5,6,7,8,9},1)*{1,2,1,2,1,2,1,2,1}),10)=0)` 
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "נתונים");
    
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `פענוח_טפסים_${new Date().toLocaleDateString('he-IL')}.xlsx`);
  };

  const downloadPDFs = async () => {
    toast.info('מתחיל בהמרת קבצים ל-PDF...');
    let count = 0;
    try {
      for (const result of results) {
        if (result.status === 'success' && result.data && result.file) {
          const doc = new jsPDF();
          const imgData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(result.file!);
          });
          
          const imgProps = doc.getImageProperties(imgData);
          const pdfWidth = doc.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          
          doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
          const fileName = result.data.idNumber && result.data.idNumber !== 'לא קריא' 
            ? `${result.data.idNumber}.pdf` 
            : `unreadable_${result.fileName}.pdf`;
          doc.save(fileName);
          count++;
        }
      }
      toast.success(`הושלמה המרה של ${count} קבצים ל-PDF`);
    } catch (error) {
      console.error("PDF conversion error:", error);
      toast.error('שגיאה במהלך המרת הקבצים ל-PDF');
    }
  };

  useEffect(() => {
    if (showDetailsView) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const firstInput = document.querySelector('input[name="employer"]') as HTMLInputElement;
        if (firstInput) {
          firstInput.focus();
          firstInput.select();
        } else {
          scrollToTop();
        }
      }, 500);
    }
  }, [showDetailsView]);

  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6 font-sans text-right" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-[#5A5A40]/10 text-center"
        >
          <div className="w-16 h-16 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-8 h-8 text-[#5A5A40]" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#1a1a1a] mb-4">התחברות למערכת</h1>
          <p className="text-[#5A5A40] mb-8 leading-relaxed">
            אנא התחבר עם חשבון גוגל כדי להפעיל את מערכת הלמידה האוטומטית ולשמור את התיקונים שלך.
          </p>
          <button
            onClick={handleLogin}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-medium hover:bg-[#4A4A30] transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            התחבר עם Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (userProfile && userProfile.status !== 'approved') {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-12 rounded-[40px] shadow-2xl max-w-md w-full text-center border-2 border-[#5A5A40]/10"
        >
          <div className="w-24 h-24 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <Lock className="w-12 h-12 text-[#5A5A40]" />
          </div>
          <h1 className="text-3xl font-bold text-[#5A5A40] mb-4">ממתין לאישור</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            החשבון שלך ({user.email}) נוצר בהצלחה. 
            כדי להיכנס למערכת, עליך להמתין לאישור ממנהל המערכת.
          </p>
          <button 
            onClick={() => auth.signOut()}
            className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
          >
            התנתק
          </button>
        </motion.div>
      </div>
    );
  }

  if (hasKey === false && userProfile?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6 font-sans text-right" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-[#5A5A40]/10 text-center"
        >
          <div className="w-16 h-16 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8 text-[#5A5A40]" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#1a1a1a] mb-4">חיבור למערכת Google AI Studio</h1>
          <p className="text-[#5A5A40] mb-8 leading-relaxed">
            כמנהל המערכת, עליך לחבר מפתח API כדי שהמערכת תעבוד עבור כל המשתמשים. 
            החיוב יתבצע ישירות מול גוגל לפי שימוש.
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-medium hover:bg-[#4A4A30] transition-colors flex items-center justify-center gap-2"
          >
            <Key className="w-5 h-5" />
            התחבר ובחר מפתח API
          </button>
          <p className="mt-4 text-xs text-gray-400">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline">
              מידע על תשלום וחיוב
            </a>
          </p>
        </motion.div>
      </div>
    );
  }

  const openCorrection = (index: number) => {
    const result = results[index];
    if (!result.data) return;
    
    // Find first unreadable or low confidence field
    const fields = Object.keys(result.data) as (keyof ExtractedData)[];
    const unreadableField = fields.find(f => {
      const val = result.data![f];
      const isLowConfidence = (result.data!.low_confidence_fields || []).includes(String(f));
      const isEmpty = val === undefined || val === null || val === '' || val === ' ';
      const isInvalidID = f === 'idNumber' && typeof val === 'string' && val !== 'לא קריא' && !isValidIsraeliID(val);
      
      // Special case: if email is empty, don't show it in correction
      if (f === 'email' && isEmpty) return false;
      
      return val === 'לא קריא' || isLowConfidence || isEmpty || isInvalidID;
    });
    
    const fieldToEdit = unreadableField || 'idNumber';
    const val = result.data[fieldToEdit];
    setEditingResultIndex(index);
    setEditingField(fieldToEdit);
    setManualValue(typeof val === 'boolean' ? (val ? 'כן' : 'לא') : String(val));
  };

  const saveAndNext = async () => {
    if (editingResultIndex === null || !editingField) return;
    
    const updatedResults = [...results];
    const currentResult = updatedResults[editingResultIndex];
    const currentData = { ...currentResult.data! };
    const originalValue = String(currentData[editingField]);

    // Save correction to Firebase for learning
    if (user && manualValue !== originalValue) {
      try {
        await logEvent('correction_made', currentResult.fileName, {
          field: editingField,
          original: originalValue,
          corrected: manualValue
        });
        await addDoc(collection(db, 'corrections'), {
          fileName: currentResult.fileName,
          field: editingField,
          originalValue: originalValue,
          correctedValue: manualValue,
          timestamp: new Date().toISOString(),
          userId: user.uid
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'corrections');
      }
    }
    
    // Update the field
    if (editingField === 'idNumber') {
      (currentData as any)[editingField] = manualValue;
    } else if (typeof currentData[editingField] === 'boolean') {
      const lower = manualValue.toLowerCase();
      (currentData as any)[editingField] = lower === 'כן' || lower === 'true' || lower === 'v' || lower === 'yes';
    } else if (typeof currentData[editingField] === 'number') {
      (currentData as any)[editingField] = Number(manualValue);
    } else {
      (currentData as any)[editingField] = manualValue;
    }

    // Re-evaluate low confidence for this field
    const isNowEmpty = manualValue === undefined || manualValue === null || manualValue === '' || manualValue === ' ';
    const isNowInvalidID = editingField === 'idNumber' && manualValue !== 'לא קריא' && !isValidIsraeliID(manualValue);
    const isNowReadable = manualValue !== 'לא קריא';

    if (currentData.low_confidence_fields) {
      if (!isNowEmpty && !isNowInvalidID && isNowReadable) {
        currentData.low_confidence_fields = currentData.low_confidence_fields.filter(f => f !== editingField);
      } else if (!currentData.low_confidence_fields.includes(String(editingField))) {
        currentData.low_confidence_fields.push(String(editingField));
      }
    }
    
    updatedResults[editingResultIndex].data = currentData;
    setResults(updatedResults);
    
    // Move to next unreadable/unsure field in same document
    const fields = Object.keys(currentData) as (keyof ExtractedData)[];
    const nextUnreadable = fields.find(f => {
      const val = currentData[f];
      const isLowConfidence = (currentData.low_confidence_fields || []).includes(String(f));
      const isEmpty = val === undefined || val === null || val === '' || val === ' ';
      const isInvalidID = f === 'idNumber' && typeof val === 'string' && val !== 'לא קריא' && !isValidIsraeliID(val);
      
      // Special case: if email is empty, don't show it in correction
      if (f === 'email' && isEmpty) return false;
      
      return val === 'לא קריא' || isLowConfidence || isEmpty || isInvalidID;
    });
    
    if (nextUnreadable) {
      setEditingField(nextUnreadable);
      setManualValue(String(currentData[nextUnreadable]));
    } else {
      // No more unreadable in this doc, move to next doc with unreadable/unsure
      const nextDocIndex = results.findIndex((r, idx) => {
        if (idx <= editingResultIndex || r.status !== 'success' || !r.data) return false;
        const data = r.data;
        const fields = Object.keys(data) as (keyof ExtractedData)[];
        return fields.some(f => {
          const val = data[f];
          const isLowConfidence = (data.low_confidence_fields || []).includes(String(f));
          const isEmpty = val === undefined || val === null || val === '' || val === ' ';
          const isInvalidID = f === 'idNumber' && typeof val === 'string' && val !== 'לא קריא' && !isValidIsraeliID(val);
          
          // Special case: if email is empty, don't show it in correction
          if (f === 'email' && isEmpty) return false;
          
          return val === 'לא קריא' || isLowConfidence || isEmpty || isInvalidID;
        });
      });
      
      if (nextDocIndex !== -1) {
        openCorrection(nextDocIndex);
      } else {
        setEditingResultIndex(null);
      }
    }
  };

  const nextUnreadable = () => {
    if (editingResultIndex === null || !editingField) return;
    const currentData = results[editingResultIndex].data!;
    const fields = Object.keys(currentData) as (keyof ExtractedData)[];
    const currentIndex = fields.indexOf(editingField);
    const next = fields.slice(currentIndex + 1).find(f => 
      currentData[f] === 'לא קריא' || 
      (currentData.low_confidence_fields || []).includes(String(f))
    );
    
    if (next) {
      setEditingField(next);
      setManualValue(String(currentData[next]));
    } else {
      const nextDocIndex = results.findIndex((r, idx) => 
        idx > editingResultIndex && 
        r.status === 'success' && 
        r.data && 
        (Object.values(r.data).some(v => v === 'לא קריא') || (r.data.low_confidence_fields || []).length > 0)
      );
      if (nextDocIndex !== -1) openCorrection(nextDocIndex);
    }
  };

  const handleDetailsFieldChange = (index: number, field: keyof ExtractedData, value: any) => {
    setResults(prev => prev.map((res, idx) => {
      if (idx === index && res.data) {
        let newData = { ...res.data, [field]: value };
        
        // Logic for declarations: if "not member" is true, then "member" is false and name is "לא"
        if (field === 'is_not_member_other_org' && value === true) {
          newData.is_member_other_org = false;
          newData.other_org_name = 'לא';
        }
        // Conversely, if "member" is true, "not member" should be false
        if (field === 'is_member_other_org' && value === true) {
          newData.is_not_member_other_org = false;
        }

        // Re-evaluate low confidence for this field
        const isNowEmpty = value === undefined || value === null || value === '' || value === ' ';
        const isNowInvalidID = field === 'idNumber' && value !== 'לא קריא' && !isValidIsraeliID(value);
        const isNowReadable = value !== 'לא קריא';

        if (newData.low_confidence_fields) {
          if (!isNowEmpty && !isNowInvalidID && isNowReadable) {
            newData.low_confidence_fields = newData.low_confidence_fields.filter(f => f !== field);
          } else if (!newData.low_confidence_fields.includes(String(field))) {
            newData.low_confidence_fields.push(String(field));
          }
        }
        
        return { ...res, data: newData };
      }
      return res;
    }));
  };

  const fieldsToOverlay: (keyof ExtractedData)[] = [
    'employer', 'lastName', 'firstName', 'idNumber', 'gender', 
    'dateOfBirth', 'email', 'street', 'houseNumber', 'city', 
    'mobilePhone', 'siteBranch', 'role', 'is_not_member_other_org', 
    'is_member_other_org', 'other_org_name', 'declaration_direct_mail', 
    'date', 'is_signed'
  ];

  const nextForm = () => {
    if (detailsResultIndex === null) return;
    const next = results.findIndex((r, idx) => idx > detailsResultIndex && r.status === 'success');
    if (next !== -1) setDetailsResultIndex(next);
  };

  const prevForm = () => {
    if (detailsResultIndex === null) return;
    const prev = results.slice(0, detailsResultIndex).reverse().findIndex(r => r.status === 'success');
    if (prev !== -1) setDetailsResultIndex(detailsResultIndex - 1 - prev);
  };

  const prevField = () => {
    if (editingResultIndex === null || !editingField) return;
    const currentData = results[editingResultIndex].data!;
    const fields = Object.keys(currentData) as (keyof ExtractedData)[];
    const currentIndex = fields.indexOf(editingField);
    if (currentIndex > 0) {
      const prev = fields[currentIndex - 1];
      setEditingField(prev);
      setManualValue(String(currentData[prev]));
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1a1a1a] font-sans p-4 md:p-8" dir="rtl">
      <Toaster dir="rtl" position="top-center" richColors />
      
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}

      <div className="max-w-6xl mx-auto">
        {/* File Details View Modal */}
        <AnimatePresence>
          {showDetailsView && detailsResultIndex !== null && results[detailsResultIndex] && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-auto">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-7xl min-h-[90vh] flex flex-col overflow-hidden"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#151619] text-white">
                  <div className="flex items-center gap-4">
                    <div className="bg-[#5A5A40] p-3 rounded-2xl">
                      <Eye className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-serif font-bold">פירוט קבצים ותוצאות</h2>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-gray-400 text-sm">קובץ: {results[detailsResultIndex].fileName} ({detailsResultIndex + 1} מתוך {results.length})</p>
                        
                        {/* Zoom & Scroll Controls */}
                        <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-2xl border border-white/10 ml-4">
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                              title="זום אאוט"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
                            <button 
                              onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                              title="זום אין"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="w-px h-4 bg-white/20 mx-1" />
                          
                          <button 
                            onClick={scrollToTop}
                            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                            title="לראש הדף"
                          >
                            <ChevronLeft className="w-4 h-4 rotate-90" />
                            ראש
                          </button>
                          <button 
                            onClick={scrollToBottom}
                            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                            title="לתחתית הדף"
                          >
                            <ChevronLeft className="w-4 h-4 -rotate-90" />
                            סוף
                          </button>
                          
                          <div className="w-px h-4 bg-white/20 mx-1" />
                          
                          <button 
                            onClick={() => setZoom(1.0)}
                            className="px-2 py-1 hover:bg-white/20 rounded text-[10px] uppercase font-bold"
                          >
                            איפוס
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowOverlays(!showOverlays)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all text-xs font-bold border",
                        showOverlays 
                          ? "bg-white/20 border-white/20 text-white hover:bg-white/30" 
                          : "bg-orange-500 border-orange-400 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
                      )}
                      title={showOverlays ? "הסתר שכבת AI" : "הצג שכבת AI"}
                    >
                      {showOverlays ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {showOverlays ? "הסתר שכבה" : "הצג שכבה"}
                    </button>
                    <button 
                      onClick={prevForm}
                      disabled={detailsResultIndex === 0}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all disabled:opacity-30"
                      title="טופס קודם"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={nextForm}
                      disabled={detailsResultIndex === results.length - 1}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all disabled:opacity-30"
                      title="טופס הבא"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        toast.success('השינויים נשמרו בהצלחה');
                        setShowDetailsView(false);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-xl transition-all text-sm font-bold shadow-md"
                    >
                      <Save className="w-4 h-4" />
                      שמור
                    </button>
                    <button 
                      onClick={() => setShowDetailsView(false)}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#F5F5F0] relative scroll-smooth">
                  <div className="w-full min-h-full flex flex-col items-center mt-[1000px] pb-40 px-12">
                    <motion.div 
                      className="relative bg-white shadow-2xl rounded-3xl overflow-hidden shrink-0" 
                      style={{ 
                        width: `${zoom * 1000}px`,
                        maxWidth: 'none'
                      }}
                    >
                    {results[detailsResultIndex].file && (
                      <div className="relative">
                        <img 
                          src={URL.createObjectURL(results[detailsResultIndex].file!)} 
                          alt="Form" 
                          className="max-w-full h-auto block pointer-events-none"
                          style={{ 
                            imageRendering: '-webkit-optimize-contrast' as any,
                            display: 'block'
                          }}
                          referrerPolicy="no-referrer"
                        />
                        {/* Overlays */}
                        {showOverlays && results[detailsResultIndex].data?.field_coordinates && fieldsToOverlay.map((field) => {
                          const coords = results[detailsResultIndex].data!.field_coordinates![field];
                          if (!coords) return null;
                          
                          const value = results[detailsResultIndex].data![field];
                          const isLowConfidence = (results[detailsResultIndex].data!.low_confidence_fields || []).includes(String(field));
                          const isUnreadable = value === 'לא קריא';
                          const isInvalidID = field === 'idNumber' && value !== 'לא קריא' && !isValidIsraeliID(String(value));
                          
                          const hasError = isLowConfidence || isUnreadable || isInvalidID;
                          
                          const isDeclaration = ['is_not_member_other_org', 'is_member_other_org', 'other_org_name', 'declaration_direct_mail', 'is_signed'].includes(field);
                          
                          // Width and height in percentage
                          const widthPct = (coords[3] - coords[1]) / 10;
                          const heightPct = (coords[2] - coords[0]) / 10;
                          
                          return (
                            <motion.div 
                              key={field}
                              drag={isEditingLayout}
                              dragMomentum={false}
                              onDragEnd={(e, info) => {
                                if (!isEditingLayout) return;
                                
                                // Get the container (the image wrapper)
                                const container = (e.target as HTMLElement).closest('.relative.bg-white.shadow-2xl');
                                const element = (e.target as HTMLElement).closest('.absolute.z-10.group');
                                if (!container || !element) return;
                                
                                const rect = container.getBoundingClientRect();
                                const elRect = element.getBoundingClientRect();
                                
                                // Calculate position relative to container in 0-1000 scale
                                const newY1 = ((elRect.top - rect.top) / rect.height) * 1000;
                                const newX1 = ((elRect.left - rect.left) / rect.width) * 1000;
                                
                                // Current field dimensions in 0-1000 scale
                                const widthVal = coords[3] - coords[1];
                                const heightVal = coords[2] - coords[0];
                                
                                const newCoords = [
                                  newY1,
                                  newX1,
                                  newY1 + heightVal,
                                  newX1 + widthVal
                                ];
                                
                                console.log(`[AI Layer Debug] Field: ${String(field)}`, {
                                  original: coords,
                                  new: newCoords,
                                  containerRect: { top: rect.top, left: rect.left, w: rect.width, h: rect.height },
                                  elementRect: { top: elRect.top, left: elRect.left }
                                });
                                
                                handleDetailsFieldChange(detailsResultIndex, 'field_coordinates' as any, {
                                  ...results[detailsResultIndex].data!.field_coordinates,
                                  [field]: newCoords
                                });

                                // Update layout template draft
                                if (isEditingLayout) {
                                  setLayoutTemplate(prev => ({
                                    coords: {
                                      ...(prev?.coords || {}),
                                      [field]: newCoords
                                    },
                                    zoom: zoom,
                                    fontSize: overlayFontSize
                                  }));
                                }
                              }}
                              className={cn(
                                "absolute z-10 group",
                                isEditingLayout && "cursor-move ring-2 ring-orange-400 ring-offset-2"
                              )}
                              style={{
                                x: 0, y: 0, // Reset motion offset after state update
                                top: `${coords[0] / 10}%`,
                                left: `${coords[1] / 10}%`,
                                width: `${widthPct}%`,
                                height: `${heightPct}%`,
                                minWidth: '40px',
                                minHeight: '20px'
                              }}
                            >
                              {isEditingLayout && (
                                <div 
                                  className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 flex items-center justify-center"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    const startX = e.clientX;
                                    const startY = e.clientY;
                                    const startWidth = coords[3] - coords[1];
                                    const startHeight = coords[2] - coords[0];
                                    
                                    const container = (e.target as HTMLElement).closest('.relative.bg-white.shadow-2xl');
                                    if (!container) return;
                                    const rect = container.getBoundingClientRect();

                                    const onMouseMove = (moveEvent: MouseEvent) => {
                                      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 1000;
                                      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 1000;
                                      
                                      const newWidth = Math.max(10, startWidth + deltaX);
                                      const newHeight = Math.max(10, startHeight + deltaY);
                                      
                                      const newCoords = [
                                        coords[0],
                                        coords[1],
                                        coords[0] + newHeight,
                                        coords[1] + newWidth
                                      ];
                                      
                                      console.log(`[AI Layer Debug] Resizing Field: ${String(field)}`, {
                                        original: coords,
                                        new: newCoords,
                                        dimensions: { width: newWidth, height: newHeight }
                                      });

                                      handleDetailsFieldChange(detailsResultIndex, 'field_coordinates' as any, {
                                        ...results[detailsResultIndex].data!.field_coordinates,
                                        [field]: newCoords
                                      });

                                      // Update layout template draft
                                      if (isEditingLayout) {
                                        setLayoutTemplate(prev => ({
                                          coords: {
                                            ...(prev?.coords || {}),
                                            [field]: newCoords
                                          },
                                          zoom: zoom,
                                          fontSize: overlayFontSize
                                        }));
                                      }
                                    };

                                    const onMouseUp = () => {
                                      document.removeEventListener('mousemove', onMouseMove);
                                      document.removeEventListener('mouseup', onMouseUp);
                                    };

                                    document.addEventListener('mousemove', onMouseMove);
                                    document.addEventListener('mouseup', onMouseUp);
                                  }}
                                >
                                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                </div>
                              )}
                              <div className="absolute -top-4 right-0 text-[8px] font-bold text-[#5A5A40] truncate bg-white/90 px-1.5 py-0.5 rounded shadow-sm pointer-events-none border border-[#5A5A40]/10">
                                {getFieldLabel(field)}
                              </div>
                              <input 
                                type="text"
                                name={field}
                                disabled={isEditingLayout}
                                value={typeof value === 'boolean' ? (value ? 'כן' : 'לא') : String(value)}
                                onFocus={(e) => {
                                  e.target.select();
                                  setFocusedField(field);
                                  
                                  const container = containerRef.current;
                                  if (container) {
                                    if (['is_signed', 'declaration_direct_mail'].includes(field)) {
                                      scrollToBottom();
                                    } else {
                                      const rect = e.target.getBoundingClientRect();
                                      const containerRect = container.getBoundingClientRect();
                                      const scrollY = container.scrollTop + (rect.top - containerRect.top) - (containerRect.height / 2) + (rect.height / 2);
                                      const scrollX = container.scrollLeft + (rect.left - containerRect.left) - (containerRect.width / 2) + (rect.width / 2);
                                      container.scrollTo({ top: scrollY, left: scrollX, behavior: 'smooth' });
                                    }
                                  }
                                }}
                                onChange={(e) => {
                                  let val: any = e.target.value;
                                  
                                  // Force English for email and idNumber
                                  if (field === 'email' || field === 'idNumber') {
                                    val = val.split('').map((char: string) => heToEnMap[char] || char).join('');
                                  }

                                  // Date formatting (DD/MM/YYYY)
                                  if (field === 'dateOfBirth' || field === 'date') {
                                    const isDeleting = (e.nativeEvent as any).inputType === 'deleteContentBackward';
                                    if (!isDeleting) {
                                      const digits = val.replace(/\D/g, '');
                                      let formatted = '';
                                      if (digits.length > 0) {
                                        formatted += digits.substring(0, 2);
                                        if (digits.length > 2) {
                                          formatted += '/' + digits.substring(2, 4);
                                          if (digits.length > 4) {
                                            formatted += '/' + digits.substring(4, 8);
                                          }
                                        }
                                      }
                                      val = formatted;
                                    }
                                  }

                                  // ID and Mobile: only digits
                                  if (field === 'idNumber' || field === 'mobilePhone') {
                                    val = val.replace(/\D/g, '');
                                  }

                                  if (typeof value === 'boolean') {
                                    if (val.includes('כן') || val === 'v' || val === 'V' || val === 'yes') val = true;
                                    else if (val.includes('לא') || val === 'x' || val === 'X' || val === 'no') val = false;
                                  }
                                  handleDetailsFieldChange(detailsResultIndex, field, val);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === '1') {
                                    const isToggleableField = ['is_not_member_other_org', 'is_member_other_org', 'declaration_direct_mail', 'is_signed', 'other_org_name', 'gender'].includes(field);
                                    if (isToggleableField) {
                                      e.preventDefault();
                                      if (['is_not_member_other_org', 'is_member_other_org', 'declaration_direct_mail', 'is_signed'].includes(field)) {
                                        handleDetailsFieldChange(detailsResultIndex, field, !value);
                                      } else if (field === 'other_org_name') {
                                        const options = ["הסתדרות כללית", "כוח לעובדים", ""];
                                        const currentIdx = options.indexOf(String(value));
                                        const nextIdx = (currentIdx + 1) % options.length;
                                        handleDetailsFieldChange(detailsResultIndex, field, options[nextIdx]);
                                      } else if (field === 'gender') {
                                        const current = String(value).trim();
                                        const newVal = current === 'זכר' ? 'נקבה' : 'זכר';
                                        handleDetailsFieldChange(detailsResultIndex, field, newVal);
                                      }
                                    }
                                  }
                                  if (e.key === '0') {
                                    if (['email', 'siteBranch', 'role', 'other_org_name'].includes(field)) {
                                      e.preventDefault();
                                      handleDetailsFieldChange(detailsResultIndex, field, "");
                                    }
                                  }
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const nextIdx = fieldsToOverlay.indexOf(field) + 1;
                                    if (nextIdx < fieldsToOverlay.length) {
                                      const nextField = fieldsToOverlay[nextIdx];
                                      const nextInput = document.querySelector(`input[name="${nextField}"]`) as HTMLInputElement;
                                      if (nextInput) {
                                        nextInput.focus();
                                        nextInput.select();
                                      }
                                    } else {
                                      // Last field, save and next
                                      toast.success('השינויים נשמרו בהצלחה');
                                      nextForm();
                                      // Focus employer in next form
                                      setTimeout(() => {
                                        const firstInput = document.querySelector('input[name="employer"]') as HTMLInputElement;
                                        if (firstInput) {
                                          firstInput.focus();
                                          firstInput.select();
                                        }
                                      }, 500);
                                    }
                                  }
                                }}
                                className={cn(
                                  "w-full h-full font-bold text-center border-2 rounded-lg outline-none transition-all shadow-lg",
                                  (field === 'idNumber' || field === 'mobilePhone') && "tracking-[0.25em]",
                                  isEditingLayout ? "bg-orange-50/80 border-orange-300" :
                                  hasError 
                                    ? "bg-white border-red-500 text-red-700 focus:ring-4 focus:ring-red-500/20" 
                                    : "bg-white border-green-500 text-green-700 focus:ring-4 focus:ring-green-500/20"
                                )}
                                style={{ fontSize: `${overlayFontSize}px` }}
                                maxLength={
                                  (field === 'dateOfBirth' || field === 'date') ? 10 : 
                                  (field === 'idNumber') ? 9 :
                                  (field === 'mobilePhone') ? 10 :
                                  undefined
                                }
                                title={getFieldLabel(field)}
                              />
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>

                {/* Footer Actions */}
                <div className="p-6 bg-white border-t border-gray-100 flex justify-between items-center">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-500/20 border border-green-500 rounded"></div>
                      <span className="text-sm text-gray-600">תקין / ביטחון גבוה</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-500/20 border border-red-500 rounded"></div>
                      <span className="text-sm text-gray-600">חשד לשגיאה / לא קריא</span>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-2xl border border-gray-200">
                      <span className="text-xs font-bold text-gray-500">גופן:</span>
                      <button 
                        onClick={() => {
                          const newSize = Math.max(6, overlayFontSize - 1);
                          setOverlayFontSize(newSize);
                          if (isEditingLayout) {
                            setLayoutTemplate(prev => prev ? { ...prev, fontSize: newSize } : null);
                          }
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono w-6 text-center">{overlayFontSize}</span>
                      <button 
                        onClick={() => {
                          const newSize = Math.min(30, overlayFontSize + 1);
                          setOverlayFontSize(newSize);
                          if (isEditingLayout) {
                            setLayoutTemplate(prev => prev ? { ...prev, fontSize: newSize } : null);
                          }
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-2xl border border-gray-200">
                      <span className="text-xs font-bold text-gray-500">רזולוציה:</span>
                      <input 
                        type="number" 
                        value={Math.round(zoom * 100)}
                        onChange={(e) => setZoom(Number(e.target.value) / 100)}
                        className="w-16 bg-transparent text-[#5A5A40] text-sm font-bold outline-none text-center"
                        step="10"
                        min="10"
                        max="1000"
                      />
                      <span className="text-xs font-bold text-gray-500">%</span>
                    </div>
                    <button 
                      onClick={() => setIsEditingLayout(!isEditingLayout)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-bold shadow-md border-2",
                        isEditingLayout 
                          ? "bg-orange-500 border-orange-600 text-white hover:bg-orange-600" 
                          : "bg-[#5A5A40] border-transparent text-white hover:bg-[#4A4A30]"
                      )}
                      title="ערוך מיקומי שדות"
                    >
                      <Edit2 className="w-4 h-4" />
                      {isEditingLayout ? 'סיים עריכת שכבה' : 'ערוך שכבת AI'}
                    </button>
                    {isEditingLayout && (
                      <button 
                        onClick={() => {
                          const currentCoords = results[detailsResultIndex].data?.field_coordinates;
                          if (currentCoords) {
                            setLayoutTemplate({
                              coords: currentCoords,
                              zoom: zoom,
                              fontSize: overlayFontSize
                            });
                            // Save to Firebase
                            saveTemplateToFirebase(currentCoords, zoom, overlayFontSize);
                            // Apply to all other successful results in this session
                            setResults(prev => prev.map(res => {
                              if (res.status === 'success' && res.data) {
                                return {
                                  ...res,
                                  data: {
                                    ...res.data,
                                    field_coordinates: currentCoords
                                  }
                                };
                              }
                              return res;
                            }));
                            setIsEditingLayout(false);
                          }
                        }}
                        className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all flex items-center gap-2 shadow-md"
                      >
                        <Save className="w-4 h-4" />
                        שמור תבנית
                      </button>
                    )}
                    <button 
                      onClick={() => setShowDetailsView(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
                    >
                      סגור
                    </button>
                    <button 
                      onClick={() => {
                        toast.success('השינויים נשמרו בהצלחה');
                        nextForm();
                      }}
                      className="px-6 py-2 bg-[#5A5A40] text-white rounded-xl text-sm font-bold hover:bg-[#4A4A30] transition-all flex items-center gap-2 shadow-md"
                    >
                      <Save className="w-4 h-4" />
                      שמור והמשך
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Correction Modal */}
        <AnimatePresence>
          {editingResultIndex !== null && editingField && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              >
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#5A5A40] text-white">
                    <h2 className="text-xl font-serif font-bold">תיקון שגיאות ידני</h2>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-white/10 p-1 rounded-xl">
                        <button 
                          onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))}
                          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                          title="זום אאוט"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
                        <button 
                          onClick={() => setZoom(prev => Math.min(3, prev + 0.2))}
                          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                          title="זום אין"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button onClick={() => setEditingResultIndex(null)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                        <XCircle className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Image Preview */}
                    <div className="md:w-1/2 bg-gray-900 p-4 flex items-center justify-center overflow-hidden relative cursor-move select-none">
                      {results[editingResultIndex].file && (
                        <motion.div 
                          key={`${editingResultIndex}-${editingField}`}
                          drag
                          dragMomentum={false}
                          onDrag={(e, info) => {
                            setDragOffset(prev => ({
                              x: prev.x + info.delta.x,
                              y: prev.y + info.delta.y
                            }));
                          }}
                          animate={{ 
                            scale: zoom,
                            x: ((50 - pan.x) * zoom * 4) + dragOffset.x,
                            y: ((50 - pan.y) * zoom * 4) + dragOffset.y
                          }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          className="w-full h-full flex items-center justify-center"
                        >
                          <img 
                            src={URL.createObjectURL(results[editingResultIndex].file!)} 
                            alt="Document" 
                            className="max-w-full max-h-full object-contain shadow-2xl rounded-lg pointer-events-none"
                          />
                        </motion.div>
                      )}
                      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                        <div className="bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px]">
                          גרור להזזה • גלול לזום
                        </div>
                        <div className="bg-[#5A5A40] text-white px-3 py-1 rounded-full text-[10px] font-bold">
                          זום: {Math.round(zoom * 100)}%
                        </div>
                      </div>
                    </div>
                    
                    {/* Edit Form */}
                    <div className="md:w-1/2 p-8 flex flex-col gap-6">
                      <div>
                        <label className="block text-xs font-bold text-[#5A5A40] uppercase tracking-wider mb-2">שדה נוכחי</label>
                        <div className="text-2xl font-serif font-bold text-[#1a1a1a]">{getFieldLabel(String(editingField))}</div>
                        <p className="text-sm text-gray-400 mt-1">קובץ: {results[editingResultIndex].fileName}</p>
                      </div>
                      
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">השלמה ידנית</label>
                        <input 
                          ref={inputRef}
                          type="text" 
                          value={manualValue}
                          onChange={(e) => setManualValue(e.target.value)}
                          onFocus={(e) => {
                            e.target.select();
                            if (manualValue === 'לא קריא') setManualValue('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveAndNext();
                            }
                          }}
                          className={cn(
                            "w-full p-4 border-2 rounded-2xl outline-none transition-all text-xl font-bold",
                            editingField === 'idNumber' 
                              ? (isValidIsraeliID(manualValue) ? "bg-green-50 border-green-500 text-green-700" : "bg-red-50 border-red-500 text-red-700")
                              : "bg-[#F5F5F0] border-transparent focus:border-[#5A5A40]"
                          )}
                          autoFocus
                        />
                      {manualValue === 'לא קריא' && (
                        <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-2 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          שדה זה סומן כלא קריא על ידי המערכת
                        </div>
                      )}
                      {results[editingResultIndex].data?.low_confidence_fields?.includes(String(editingField)) && (
                        <div className="mt-4 p-4 bg-orange-50 text-orange-600 rounded-2xl flex items-center gap-2 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          המערכת לא בטוחה ב-100% לגבי שדה זה
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={prevField}
                        className="p-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-colors"
                      >
                        קודם
                      </button>
                      <button 
                        onClick={nextUnreadable}
                        className="p-4 bg-white border-2 border-[#5A5A40] text-[#5A5A40] rounded-2xl font-bold hover:bg-[#5A5A40] hover:text-white transition-colors"
                      >
                        הבא (לא קריא)
                      </button>
                      <button 
                        onClick={saveAndNext}
                        className="col-span-2 p-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        שמור והמשך
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#5A5A40] rounded-3xl flex items-center justify-center shadow-xl shadow-[#5A5A40]/20">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold text-[#1a1a1a]">AI Form Processor</h1>
              <p className="text-[#5A5A40] font-medium opacity-60">פענוח טפסים חכם מבוסס בינה מלאכותית</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => setShowAdminPanel(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-xl font-bold hover:bg-orange-200 transition-all"
              >
                <Users className="w-4 h-4" />
                ניהול משתמשים
              </button>
            )}
            <div className="flex items-center gap-4 bg-white p-2 pr-5 rounded-3xl shadow-sm border border-[#5A5A40]/5">
              <div className="text-right">
                <div className="text-sm font-bold text-[#1a1a1a]">{user?.displayName}</div>
                <div className="text-[10px] text-[#5A5A40] opacity-60 font-mono">{user?.email}</div>
              </div>
              {user?.photoURL ? (
                <img src={user.photoURL} className="w-10 h-10 rounded-2xl shadow-sm" alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 bg-[#5A5A40] rounded-2xl flex items-center justify-center text-white font-bold">
                  {user?.email?.[0].toUpperCase()}
                </div>
              )}
              <button 
                onClick={() => auth.signOut()}
                className="p-2 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-xl transition-all"
                title="התנתק"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>
        <div className="flex flex-wrap gap-4 mb-8">
          {results.some(r => r.status === 'success') && (
            <>
              <button
                onClick={() => {
                  if (results.some(r => r.status === 'success')) {
                    const firstSuccess = results.findIndex(r => r.status === 'success');
                    setDetailsResultIndex(firstSuccess);
                    if (layoutTemplate) setZoom(layoutTemplate.zoom);
                    setShowDetailsView(true);
                  }
                }}
                className="flex items-center gap-2 bg-white border border-[#5A5A40] text-[#5A5A40] px-4 py-2 rounded-xl hover:bg-[#5A5A40] hover:text-white transition-all shadow-sm text-sm font-bold"
              >
                <Eye className="w-4 h-4" />
                פירוט קבצים
              </button>
              <button
                onClick={downloadPDFs}
                className="flex items-center gap-2 bg-white border border-[#5A5A40] text-[#5A5A40] px-4 py-2 rounded-xl hover:bg-[#5A5A40] hover:text-white transition-all shadow-sm text-sm font-bold"
              >
                <FileText className="w-4 h-4" />
                המר ל-PDF
              </button>
              <button
                onClick={downloadExcel}
                className="flex items-center gap-2 bg-white border border-[#5A5A40] text-[#5A5A40] px-4 py-2 rounded-xl hover:bg-[#5A5A40] hover:text-white transition-all shadow-sm text-sm font-bold"
              >
                <Download className="w-4 h-4" />
                הורד אקסל
              </button>
              {sessionId && (
                <button
                  onClick={clearSessionData}
                  className="flex items-center gap-2 bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl hover:bg-red-50 transition-all shadow-sm text-sm font-bold"
                  title="נקה נתוני מעקב מהדאטה-בייס"
                >
                  <Trash2 className="w-4 h-4" />
                  נקה נתונים
                </button>
              )}
            </>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.webkitdirectory = false;
                  fileInputRef.current.click();
                }
              }}
              disabled={isProcessing}
              className="flex items-center gap-2 bg-white border border-[#5A5A40] text-[#5A5A40] px-4 py-2 rounded-xl hover:bg-[#5A5A40] hover:text-white transition-all shadow-sm disabled:opacity-50 text-sm font-bold"
            >
              <FileText className="w-4 h-4" />
              בחר קבצים
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.webkitdirectory = true;
                  fileInputRef.current.click();
                }
              }}
              disabled={isProcessing}
              className="flex items-center gap-2 bg-[#5A5A40] text-white px-6 py-2 rounded-xl hover:bg-[#4A4A30] transition-all shadow-md disabled:opacity-50 text-sm font-bold"
            >
              <Upload className="w-4 h-4" />
              בחר תיקייה
            </button>
          </div>
        </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept="image/*"
              />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Progress & Stats */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#5A5A40]/10">
              <h2 className="text-xl font-serif font-bold mb-6 flex items-center gap-2">
                <Loader2 className={cn("w-5 h-5", isProcessing && "animate-spin")} />
                סטטוס עבודה
              </h2>
              
              <div className="space-y-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>התקדמות כללית</span>
                  <span>{files.length > 0 ? Math.round((results.filter(r => r.status !== 'pending').length / files.length) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  <motion.div 
                    className="bg-[#5A5A40] h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${files.length > 0 ? (results.filter(r => r.status !== 'pending').length / files.length) * 100 : 0}%` }}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl text-center">
                    <div className="text-2xl font-bold">{files.length}</div>
                    <div className="text-xs text-[#5A5A40]">סה"כ קבצים</div>
                  </div>
                  <div className="bg-[#F5F5F0] p-4 rounded-2xl text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {results.filter(r => r.status === 'success').length}
                    </div>
                    <div className="text-xs text-[#5A5A40]">הושלמו בהצלחה</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-2xl text-center col-span-2">
                    <div className="text-2xl font-bold text-red-600">
                      {results.reduce((acc, r) => {
                        if (!r.data) return acc;
                        const unreadable = Object.values(r.data).filter(v => v === 'לא קריא').length;
                        const unsure = r.data.low_confidence_fields?.length || 0;
                        return acc + unreadable + unsure;
                      }, 0)}
                    </div>
                    <div className="text-xs text-red-600">שגיאות/חשדות לתיקון</div>
                  </div>
                </div>

                {files.length > 0 && !isProcessing && results.some(r => r.status === 'pending') && (
                  <button
                    onClick={processFiles}
                    className="w-full mt-6 bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:bg-[#4A4A30] transition-colors"
                  >
                    התחל פענוח
                  </button>
                )}
              </div>
            </div>

            {currentFileIndex !== -1 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-6 shadow-sm border border-[#5A5A40]/10"
              >
                <h3 className="text-sm font-bold text-[#5A5A40] mb-2 uppercase tracking-wider">מעבד כעת:</h3>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#F5F5F0] rounded-xl">
                    <FileText className="w-6 h-6 text-[#5A5A40]" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-bold truncate">{files[currentFileIndex].name}</div>
                    <div className="text-xs text-gray-400">Gemini AI מנתח את התמונה...</div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Results Table */}
          <div className="lg:col-span-2">
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="bg-white rounded-3xl shadow-sm border border-[#5A5A40]/10 overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-serif font-bold">פירוט קבצים</h2>
                <span className="text-xs bg-gray-100 px-3 py-1 rounded-full text-gray-500">
                  {results.length} קבצים ברשימה
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-gray-50 text-[#5A5A40] text-sm">
                    <tr>
                      <th className="px-6 py-4 font-medium">שם קובץ</th>
                      <th className="px-6 py-4 font-medium">סטטוס</th>
                      <th className="px-6 py-4 font-medium">שם עובד</th>
                      <th className="px-6 py-4 font-medium">ת.זהות</th>
                      <th className="px-6 py-4 font-medium">ביטחון</th>
                      <th className="px-6 py-4 font-medium">איכות תמונה</th>
                      <th className="px-6 py-4 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <AnimatePresence mode="popLayout">
                      {results.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-20 text-center text-gray-400">
                            <div className="flex flex-col items-center gap-3">
                              <Upload className="w-10 h-10 opacity-20" />
                              <p>טרם נבחרו קבצים לעיבוד</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        results.map((res, idx) => (
                          <motion.tr 
                            key={res.fileName}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={cn(
                              "hover:bg-gray-50/50 transition-colors",
                              idx === currentFileIndex && "bg-[#F5F5F0]/50"
                            )}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="font-medium text-sm truncate max-w-[200px]">{res.fileName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm">
                                {res.status === 'pending' && <span className="text-gray-400">ממתין</span>}
                                {res.status === 'processing' && (
                                  <span className="text-[#5A5A40] flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    מעבד...
                                  </span>
                                )}
                                {res.status === 'success' && (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    הושלם
                                  </span>
                                )}
                                {res.status === 'error' && (
                                  <span className="text-red-500 flex items-center gap-1">
                                    <XCircle className="w-3 h-3" />
                                    שגיאה
                                  </span>
                                )}
                              </div>
                            </td>
                            <td 
                              className="px-6 py-4 font-medium text-gray-900 cursor-pointer hover:text-[#5A5A40] hover:bg-[#F5F5F0] transition-all"
                              onClick={() => {
                                setDetailsResultIndex(idx);
                                setZoom(1.0);
                                setShowDetailsView(true);
                                setFocusedField('firstName');
                              }}
                            >
                              {res.data ? `${res.data.firstName || ""} ${res.data.lastName || ""}` : "-"}
                            </td>
                            <td 
                              className="px-6 py-4 font-mono cursor-pointer hover:text-[#5A5A40] hover:bg-[#F5F5F0] transition-all"
                              onClick={() => {
                                setDetailsResultIndex(idx);
                                setZoom(1.0);
                                setShowDetailsView(true);
                                setFocusedField('idNumber');
                              }}
                            >
                              {res.data?.idNumber || "-"}
                            </td>
                            <td className="px-6 py-4">
                              {res.status === 'success' ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className={cn(
                                        "h-full rounded-full",
                                        (res.confidence_score || 0) > 80 ? "bg-green-500" : 
                                        (res.confidence_score || 0) > 50 ? "bg-yellow-500" : "bg-red-500"
                                      )}
                                      style={{ width: `${res.confidence_score}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono">{res.confidence_score}%</span>
                                </div>
                              ) : "-"}
                            </td>
                            <td className="px-6 py-4">
                              {res.status === 'success' ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className={cn(
                                        "h-full rounded-full",
                                        (res.image_quality_score || 0) > 70 ? "bg-blue-500" : 
                                        (res.image_quality_score || 0) > 40 ? "bg-orange-500" : "bg-red-500"
                                      )}
                                      style={{ width: `${res.image_quality_score}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono">{res.image_quality_score}%</span>
                                </div>
                              ) : "-"}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                {res.status === 'error' && (
                                  <button 
                                    title={res.error}
                                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                                  >
                                    <AlertCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {res.status === 'success' && (
                                  <>
                                    <button 
                                      onClick={() => {
                                        setDetailsResultIndex(idx);
                                        const targetZoom = layoutTemplate ? Math.max(layoutTemplate.zoom, 1.0) : 1.0;
                                        setZoom(targetZoom);
                                        setShowDetailsView(true);
                                      }}
                                      className="flex items-center gap-1 px-3 py-1 rounded-lg border border-[#5A5A40]/20 text-[#5A5A40] text-xs font-bold hover:bg-[#F5F5F0] transition-all shadow-sm hover:shadow-md"
                                      title="פירוט מלא בזום"
                                    >
                                      <Search className="w-3 h-3" />
                                      פירוט
                                    </button>
                                    <button 
                                      onClick={() => openCorrection(idx)}
                                      className={cn(
                                        "flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-bold transition-colors",
                                        (Object.values(res.data!).some(v => v === 'לא קריא') || (res.data!.low_confidence_fields || []).length > 0)
                                          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                                          : "text-[#5A5A40] border-[#5A5A40]/20 hover:bg-[#F5F5F0]"
                                      )}
                                    >
                                      { (Object.values(res.data!).some(v => v === 'לא קריא') || (res.data!.low_confidence_fields || []).length > 0) && <AlertCircle className="w-3 h-3" /> }
                                      תיקון שגיאות
                                    </button>
                                    <button className="text-[#5A5A40] hover:bg-[#F5F5F0] p-2 rounded-lg">
                                      <ChevronRight className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
