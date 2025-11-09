import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Anchor, Clock, DollarSign, User, Settings, Plus, Edit, Trash2, Check, X, Filter, Search, CreditCard, Lock, Eye, EyeOff } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { supabase } from './supabase';
import PaymentPage from './PaymentPage';
import { uploadUserDocument, uploadSlipImage } from './storage-utils';

// Store clientSecret in DockRentalPlatform state to pass to Elements
let globalClientSecret = null;
let globalSetClientSecret = null;

// Deploy marker to force Vercel redeploy
console.log("DEPLOY_MARKER 2025-09-19T17:00-0400");

// Stripe configuration - Use React environment variables
const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_51SG5p53j9XCjmWOGSpK1ex75CbbmwN01r6RbOZ2QKgoWZ7Q6K1gEu12OgUhgSb2ur6LoBJSOA7V2K9zS0WhbPwJk00l16UUppK'
);

console.log('Using Stripe key:', (process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_51SG5p53j9XCjmWOGSpK1ex75CbbmwN01r6RbOZ2QKgoWZ7Q6K1gEu12OgUhgSb2ur6LoBJSOA7V2K9zS0WhbPwJk00l16UUppK').substring(0, 20));

// Add this line right after:
console.log('Stripe Key:', process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
console.log('Stripe Promise:', stripePromise);

const DockRentalPlatform = () => {
  const [currentView, setCurrentView] = useState(null); // Start with null, will be set based on auth
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [showPaymentPage, setShowPaymentPage] = useState(false);
  const [bookings, setBookings] = useState([
    {
      id: 1001,
      slipId: 2,
      slipName: "Slip 2",
      guestName: "Captain Maria Rodriguez",
      guestEmail: "maria.rodriguez@email.com",
      guestPhone: "(305) 555-0123",
      checkIn: "2025-06-22",
      checkOut: "2025-06-24",
      boatLength: "24",
      boatMakeModel: "Boston Whaler Outrage 240",
      userType: "renter",
      nights: 2,
      totalCost: 120,
      status: "confirmed",
      bookingDate: "2025-06-20",
      rentalAgreementName: "Vacation_Rental_Agreement_2025.pdf",
      insuranceProofName: "Progressive_Marine_Insurance.pdf",
      paymentStatus: "scheduled",
      paymentDate: "2025-06-22",
      paymentMethod: "stripe",
      rentalProperty: "9580 Almirate Court LGI",
      rentalStartDate: "2025-06-20",
      rentalEndDate: "2025-06-30",
      cancellationDate: null,
      cancellationReason: null,
      refundAmount: null
    }
  ]);
  const [adminMode, setAdminMode] = useState(false);
  const [superAdminMode, setSuperAdminMode] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allAdmins, setAllAdmins] = useState([]);
  const [showAdminManagement, setShowAdminManagement] = useState(false);
  const [newAdminData, setNewAdminData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    userType: 'admin',
    permissions: {
      manage_slips: true,
      manage_bookings: true,
      view_analytics: true,
      manage_users: false,
      manage_admins: false,
      system_settings: false
    }
  });
  const [showPermit, setShowPermit] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showCancellationModal, setShowCancellationModal] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [editingSlip, setEditingSlip] = useState(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [showBookingManagement, setShowBookingManagement] = useState(false);
  const [showFinancialReport, setShowFinancialReport] = useState(false);
  const [adminView, setAdminView] = useState('overview'); // overview, bookings, financials, settings
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState({
    name: '',
    phone: '',
    userType: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    confirmPassword: '',
    phone: '',
    userType: 'renter'
  });
  const [userBookings, setUserBookings] = useState([]);
  const [editingImage, setEditingImage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [slipsLoading, setSlipsLoading] = useState(true);
  const [cancellationPolicy] = useState({
    homeowner: { fee: 0, description: "Free cancellation anytime" },
    renter: {
      "7+": { fee: 0, description: "Free cancellation 7+ days before check-in" },
      "3-6": { fee: 0.5, description: "50% refund 3-6 days before check-in" },
      "1-2": { fee: 0.75, description: "25% refund 1-2 days before check-in" },
      "0": { fee: 1, description: "No refund within 24 hours of check-in" }
    }
  });
  
  const [bookingData, setBookingData] = useState({
    checkIn: '',
    checkOut: '',
    boatLength: '',
    boatMakeModel: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    rentalAgreement: null,
    insuranceProof: null,
    boatPicture: null,
    paymentMethod: 'stripe',
    userType: 'renter',
    selectedOwner: '',
    homeownerAuthorizationLetter: null,
    homeownerInsuranceProof: null,
    // Removed rental property fields - simplified to just dock dates
  });

  // New simplified authentication states
  const [authStep, setAuthStep] = useState('login'); // 'login', 'register', 'verify-contact', 'forgot-password', 'reset-password'
  const [tempEmail, setTempEmail] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  
  const [searchFilters, setSearchFilters] = useState({
    maxLength: '',
    priceRange: '',
    amenities: [],
    dateRangeStart: '',
    dateRangeEnd: ''
  });

  // Property owners data from the spreadsheet
  const propertyOwners = [
    { name: "Jaime Puerto & Carolina Sendon", address: "9486 Alborado Road LGI", parcel: "422022326010", email: "asalvador@sunshinewindows.com" },
    { name: "Don & Kathleen Eves", address: "9488 Aborado Road LGI", parcel: "422022328008", email: "" },
    { name: "Tillis & Sons, Inc.", address: "9490 Alborado Road LGI", parcel: "442022326011", email: "jtillis3@tampabay.rr.com" },
    { name: "David Groom", address: "9492 Alborado Road LGI", parcel: "422022328009", email: "groom2@comcast.net" },
    { name: "Michael & Ann Simon", address: "9494 Alborado Road LGI", parcel: "442022326012", email: "mjsimon412@gmail.com" },
    { name: "Paul & Barbara Holmes", address: "9496 Alborado Road LGI", parcel: "422022328010", email: "paulholmes@ewol.com" },
    { name: "Richard Novak", address: "9498 Alborado Road LGI", parcel: "442022376001", email: "rmnovak@uic.edu" },
    { name: "Randall & Stormy Jackson", address: "9502 Alborado Road LGI", parcel: "442022376002", email: "" },
    { name: "Bruce & Roxanne McVay", address: "9506 Don Jose Court LGI", parcel: "422022328020", email: "rnmcvay@aol.com" },
    { name: "Richard & Patricia Walldov", address: "9508 Don Jose Court LGI", parcel: "422022402005", email: "" },
    { name: "Alan Granburg and Melissa Thompson", address: "9510 Don Jose Court LGI", parcel: "422022328019", email: "mthompson03255@gmail.com" },
    { name: "Donald & Jacqueline Scattergood", address: "9512 Don Jose Court LGI", parcel: "422022329009", email: "dscattergood@gmail.com" },
    { name: "Linda Plumlee & P M Parrish", address: "9514 Don Jose Court LGI", parcel: "422022328018", email: "" },
    { name: "Jack Cleghorn", address: "9516 Don Jose Court LGI", parcel: "422022329008", email: "jtclecghorn@comcast.net" },
    { name: "Ron & Gena Moore", address: "9576 Almirate Court LGI", parcel: "422022402002", email: "moorecars@gmail.com" },
    { name: "Tom & Vivian McFarland", address: "9580 Almirate Court LGI", parcel: "422022402003", email: "tomandvivian@gmail.com" },
    { name: "Bronest & Judith York", address: "9582 Almirate Court LGI", parcel: "422022403009", email: "" },
    { name: "Glen & Heather Taylor", address: "9584 & 9586 Almirate Court LGI", parcel: "422022402004", email: "glen@centriclearning.net" },
    { name: "George & Jennifer Schaffer", address: "9585 Almirate Court LGI", parcel: "", email: "" },
    { name: "Dorothy T Cleghorn W.W. Coyner", address: "9650 Don Jose Court LGI", parcel: "422022403020", email: "jtclecghorn@comcast.net" },
    { name: "Little Gasparilla Water Utility, Inc.", address: "9652 Privateer Road LGI", parcel: "422022403018", email: "" },
    { name: "Eric & Mary Ellen Gonzales", address: "9654 Privateer Road LGI", parcel: "422022403021", email: "marygonzales058@gmail.com" },
    { name: "Chris & Heather Mariscal", address: "9656 Privateer Road LGI", parcel: "422022403022", email: "heathergmariscal@gmail.com" },
    { name: "Robert W. Brown & Rosemary B Eure", address: "9660 Privateer Road LGI", parcel: "422022406001", email: "rosemarye@lancasterlawyers.com" },
    { name: "James & Shelly Connell", address: "9662 Privateer Road LGI", parcel: "422022406002", email: "" },
    { name: "Barry and Kaye Hurt", address: "9666 Privateer Road LGI", parcel: "422022406004", email: "bhurt@tampabay.rr.com" },
    { name: "John & Cindy Tillis", address: "9668 Privateer Road LGI", parcel: "422022406005", email: "jtillis3@tampabay.rr.com" },
    { name: "Robert & Lilliam Hoerr", address: "9672 Privateer Road LGI", parcel: "422022406007", email: "bobhoerr@comcast.net" },
    { name: "George & Sue Paskert", address: "9674 Privateer Road LGI", parcel: "422022406008", email: "gpaskert@aol.com" },
    { name: "Roy & Claudia Tillett", address: "9678 Privateer Road LGI", parcel: "422022406010", email: "" },
    { name: "Donald & Mary Lee Kennefick", address: "9682 Privateer Road LGI", parcel: "422022406020", email: "kennefick6@comcast.net" },
    { name: "Don Reynolds", address: "9684 Privateer Road LGI", parcel: "422022330004", email: "apexmortgagrebrokers@gmail.com" },
    { name: "Faris and Penny Jahna", address: "9686 Privateer Road LGI", parcel: "422022330003", email: "faris1@hotmail.com" }
  ];

  // Slips data loaded from Supabase only
  const normalizeUserType = (value) => {
    if (!value) return 'renter';
    return value.toString().toLowerCase();
  };

  const [slips, setSlips] = useState([]);
  const [allSlips, setAllSlips] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const currentUserType = currentUser ? normalizeUserType(currentUser.user_type || currentUser.userType || currentUser.user_role) : null;
  const canManageUserRoles = currentUserType === 'admin' || currentUserType === 'superadmin';


  // Helper function to validate dates
  const validateDates = (checkIn, checkOut) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (checkInDate < today) {
      return { valid: false, message: 'Check-in date cannot be in the past.' };
    }
    
    if (checkOutDate <= checkInDate) {
      return { valid: false, message: 'Check-out date must be after check-in date.' };
    }
    
    // Calculate number of days
    const days = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    
    // Check 30-day limit for renters
    if (currentUser && currentUser.user_type === 'renter' && days > 30) {
      return { valid: false, message: 'Renters can only book up to 30 days at a time.' };
    }
    
    return { valid: true, days: days };
  };

  const transformSlipsData = (slipArray = []) => {
    return (slipArray || []).map((slip) => {
      let images = slip.images || [];

      if (typeof images === 'string') {
        if (images.startsWith('[')) {
          try {
            images = JSON.parse(images);
          } catch (error) {
            console.error('Error parsing slip images JSON string:', error);
            images = [];
          }
        } else if (images.startsWith('data:image/')) {
          images = [images];
        } else {
          images = [];
        }
      }

      const parseNumeric = (value) => {
        if (value == null || value === '') return null;
        const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const maxLength = slip.max_boat_length != null ? slip.max_boat_length : slip.max_length;

      return {
        id: slip.id,
        name: slip.name,
        max_length: parseNumeric(maxLength),
        width: parseNumeric(slip.width),
        depth: parseNumeric(slip.depth),
        price_per_night: parseNumeric(slip.price_per_night) || 0,
        amenities: Array.isArray(slip.amenities) ? slip.amenities : (slip.amenities ? [slip.amenities] : []),
        description: slip.description,
        dockEtiquette: slip.dock_etiquette,
        available: typeof slip.available === 'boolean' ? slip.available : true,
        images
      };
    });
  };

  const transformBookingsData = (bookingArray = [], slipList = []) => {
    const referenceSlips = (slipList && slipList.length ? slipList : (allSlips.length ? allSlips : slips));
    const slipLookup = new Map(referenceSlips.map((slip) => [slip.id, slip]));

    return (bookingArray || []).map((booking) => {
      const slip = slipLookup.get(booking.slip_id) || slipLookup.get(booking.slipId);
      const slipName = slip ? slip.name : (booking.slipName || (booking.slip_id ? `Slip ${booking.slip_id}` : 'Unknown Slip'));

      const normalizeDate = (value) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      };

      return {
        ...booking,
        slipName,
        slipId: booking.slip_id || booking.slipId,
        guestName: booking.guest_name || booking.guestName,
        guestEmail: booking.guest_email || booking.guestEmail,
        guestPhone: booking.guest_phone || booking.guestPhone,
        checkIn: normalizeDate(booking.check_in || booking.checkIn),
        checkOut: normalizeDate(booking.check_out || booking.checkOut),
        boatLength: booking.boat_length || booking.boatLength,
        boatMakeModel: booking.boat_make_model || booking.boatMakeModel,
        userType: booking.user_type || booking.userType,
        totalCost: booking.total_cost || booking.totalCost,
        bookingDate: normalizeDate(booking.booking_date || booking.bookingDate),
        paymentStatus: booking.payment_status || booking.paymentStatus,
        paymentMethod: booking.payment_method || booking.paymentMethod,
        paymentDate: normalizeDate(booking.payment_date || booking.paymentDate),
        paymentReference: booking.payment_reference || booking.paymentReference,
        rentalAgreementName: booking.rental_agreement_name || booking.rentalAgreementName,
        rentalAgreementPath: booking.rental_agreement_path || booking.rentalAgreementPath,
        insuranceProofName: booking.insurance_proof_name || booking.insuranceProofName,
        insuranceProofPath: booking.insurance_proof_path || booking.insuranceProofPath,
        boatPicturePath: booking.boat_picture_path || booking.boatPicturePath,
        status: booking.status || booking.status,
        paymentIntentId: booking.payment_reference || booking.paymentIntentId,
        user_id: booking.user_id
      };
    });
  };

  // Helper function to calculate booking total with discount
  const calculateBookingTotal = (checkIn, checkOut, price_per_night) => {
    if (!checkIn || !checkOut || !price_per_night) {
      return {
        baseTotal: 0,
        discount: 0,
        finalTotal: 0,
        days: 0,
        hasDiscount: false
      };
    }
    
    const days = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const baseTotal = days * price_per_night;
    
    // Apply 40% discount for 30-day bookings by renters
    if (currentUser && currentUser.user_type === 'renter' && days === 30) {
      const discount = baseTotal * 0.4;
      return {
        baseTotal: baseTotal,
        discount: discount,
        finalTotal: baseTotal - discount,
        days: days,
        hasDiscount: true
      };
    }
    
    return {
      baseTotal: baseTotal,
      discount: 0,
      finalTotal: baseTotal,
      days: days,
      hasDiscount: false
    };
  };

  // Helper function to check slip availability for date range
  const isSlipAvailableForDates = (slipId, checkIn, checkOut) => {
    const conflictingBookings = bookings.filter(booking => 
      booking.slipId === slipId && 
      booking.status === 'confirmed' &&
      new Date(booking.checkIn) < new Date(checkOut) &&
      new Date(booking.checkOut) > new Date(checkIn)
    );
    return conflictingBookings.length === 0;
  };

  // Update slip availability based on bookings
  useEffect(() => {
    const updatedSlips = slips.map(slip => {
      const confirmedBookings = bookings.filter(booking => 
        booking.slipId === slip.id && 
        booking.status === 'confirmed'
      );
      
      // Check if slip has any current/future confirmed bookings
      const hasActiveBookings = confirmedBookings.some(booking => {
        const checkOutDate = new Date(booking.checkOut);
        const today = new Date();
        return checkOutDate >= today;
      });
      
      return {
        ...slip,
        available: !hasActiveBookings
      };
    });
    
    setSlips(updatedSlips);
  }, [bookings]);

  // AUTH STATE LISTENER
  // Initialize session restoration on app load
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('AUTH DEBUG - Initializing auth state...');
        // Get the current session from Supabase
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('AUTH DEBUG - Error getting session:', error);
          setSessionLoading(false);
          return;
        }

        if (session?.user) {
          console.log('AUTH DEBUG - Restoring session for:', session.user.email);
          
          try {
            // Try to fetch user profile from database (with timeout)
          const userProfile = await ensureUserProfile(session.user);
            
            if (userProfile) {
          setCurrentUser(userProfile);
          
          // Set admin mode if superadmin
          if (userProfile.user_type === 'superadmin') {
            setAdminMode(true);
            setSuperAdminMode(true);
          }
          
          // Load user's bookings - filter by user_id (with fallback to email for backward compatibility)
          const userBookings = bookings.filter(booking => 
            (booking.user_id && booking.user_id === userProfile.id) || 
            (!booking.user_id && booking.guestEmail === userProfile.email)
          );
          setUserBookings(userBookings);
          
          console.log('AUTH DEBUG - Session restored successfully');
            } else {
              // Profile not found - create minimal user from session
              // Backend will create profile when needed
              console.warn('AUTH DEBUG - Profile not found, using minimal user from session');
              const minimalUser = {
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                user_type: normalizeUserType(session.user.user_metadata?.userType || session.user.user_metadata?.user_type || session.user.user_metadata?.userRole),
                phone: session.user.user_metadata?.phone || '',
                email_verified: session.user.email_confirmed_at !== null
              };
              setCurrentUser(minimalUser);
            }
          } catch (profileError) {
            console.error('AUTH DEBUG - Error fetching user profile:', profileError);
            // Create a minimal user object from the session even if profile fetch fails
            const minimalUser = {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              user_type: normalizeUserType(session.user.user_metadata?.userType || session.user.user_metadata?.user_type || session.user.user_metadata?.userRole),
              phone: session.user.user_metadata?.phone || '',
              email_verified: session.user.email_confirmed_at !== null
            };
            setCurrentUser(minimalUser);
          }
        } else {
          console.log('AUTH DEBUG - No active session found');
        }
      } catch (error) {
        console.error('AUTH DEBUG - Error initializing auth:', error);
      } finally {
        // Always set loading to false after initialization
        console.log('AUTH DEBUG - Setting sessionLoading to false');
        setSessionLoading(false);
      }
    };

    // Initialize auth state
    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AUTH DEBUG - Auth state changed:', event, session?.user?.email);
        
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          // User signed in or token refreshed (including after email confirmation)
          console.log('AUTH DEBUG - User authenticated, ensuring profile exists in database');
          try {
          const userProfile = await ensureUserProfile(session.user);
          
          if (userProfile) {
          setCurrentUser(userProfile);
          
          // Set admin mode if superadmin
          if (userProfile.user_type === 'superadmin') {
            setAdminMode(true);
            setSuperAdminMode(true);
          }
          
          // Load user's bookings
          const userBookings = bookings.filter(booking => 
            (booking.user_id && booking.user_id === userProfile.id) || 
            (!booking.user_id && booking.guestEmail === userProfile.email)
          );
          setUserBookings(userBookings);
          } else {
            // Profile not found - create minimal user from session
            console.warn('AUTH DEBUG - Profile not found, using minimal user from session');
            const minimalUser = {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              user_type: normalizeUserType(session.user.user_metadata?.userType || session.user.user_metadata?.user_type || session.user.user_metadata?.userRole),
              phone: session.user.user_metadata?.phone || '',
              email_verified: session.user.email_confirmed_at !== null
            };
            setCurrentUser(minimalUser);
          }
            
            // If email was just confirmed, show a message
            if (event === 'TOKEN_REFRESHED' && session.user.email_confirmed_at && !currentUser) {
              console.log('AUTH DEBUG - Email confirmed via token refresh');
            }
          } catch (error) {
            console.error('AUTH DEBUG - Error ensuring user profile:', error);
            // Create minimal user even on error
            const minimalUser = {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              user_type: normalizeUserType(session.user.user_metadata?.userType || session.user.user_metadata?.user_type || session.user.user_metadata?.userRole),
              phone: session.user.user_metadata?.phone || '',
              email_verified: session.user.email_confirmed_at !== null
            };
            setCurrentUser(minimalUser);
          }
        } else if (event === 'SIGNED_OUT') {
          // Clear user state on sign out
          setCurrentUser(null);
          setAdminMode(false);
          setSuperAdminMode(false);
          setUserBookings([]);
          setAuthStep('login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);


  // Auto-populate booking data when slip is selected and user is logged in
  useEffect(() => {
    if (selectedSlip && currentUser && currentView === 'booking') {
      // Auto-populate guest information from logged-in user
      setBookingData(prev => ({
        ...prev,
        guestName: currentUser.name || currentUser.email?.split('@')[0] || '',
        guestEmail: currentUser.email || '',
        guestPhone: currentUser.phone || prev.guestPhone || '',
        userType: currentUserType || prev.userType || 'renter'
      }));
    }
  }, [selectedSlip, currentUser, currentView, currentUserType]);

  useEffect(() => {
    if (currentUserType && bookingData.userType !== currentUserType) {
      setBookingData(prev => ({
        ...prev,
        userType: currentUserType
      }));
    }
  }, [currentUserType]);

  // Update userBookings whenever bookings or currentUser changes
  useEffect(() => {
    if (currentUser && bookings.length > 0) {
      // Filter bookings by user_id (with fallback to email for backward compatibility)
      const filteredBookings = bookings.filter(booking => 
        (booking.user_id && booking.user_id === currentUser.id) || 
        (!booking.user_id && booking.guestEmail === currentUser.email)
      );
      setUserBookings(filteredBookings);
    } else if (!currentUser) {
      // Clear userBookings when user logs out
      setUserBookings([]);
    }
  }, [bookings, currentUser]);

  // Re-transform bookings when slips are loaded to add slipName
  useEffect(() => {
    if (slips.length > 0 && bookings.length > 0) {
      const transformedBookings = bookings.map(booking => {
        // Only update if slipName is missing or if we can find a better match
        if (!booking.slipName || booking.slipName.startsWith('Slip ')) {
          const slip = slips.find(s => s.id === booking.slip_id || s.id === booking.slipId);
          if (slip) {
            return {
              ...booking,
              slipName: slip.name
            };
          }
        }
        return booking;
      });
      // Only update if there are actual changes (prevents infinite loops)
      const hasChanges = transformedBookings.some((b, i) => b.slipName !== bookings[i]?.slipName);
      if (hasChanges) {
        setBookings(transformedBookings);
      }
    }
  }, [slips, bookings]);

  // Auto-show login modal if user tries to browse without authentication
  useEffect(() => {
    // Wait for session to finish loading
    if (sessionLoading) {
      return;
    }

    // Initialize view based on authentication status
    if (currentUser && currentView === null) {
      // Set initial view to browse if authenticated and no view set
      setCurrentView('browse');
    } else if (!currentUser && currentView === null) {
      // Show login modal on initial load if not authenticated
      setShowLoginModal(true);
      resetAuthFlow();
    }
  }, [currentUser, sessionLoading]); // Only depend on auth state to avoid loops

  // Handle browse view access - show login if not authenticated
  useEffect(() => {
    if (!sessionLoading && !currentUser && currentView === 'browse') {
      setShowLoginModal(true);
      resetAuthFlow();
    }
  }, [currentView, currentUser, sessionLoading]);

  // Handle cancellation
  const handleCancellation = (booking) => {
    if (!cancellationReason.trim()) {
      alert('Please provide a reason for cancellation.');
      return;
    }

    const checkInDate = new Date(booking.checkIn);
    const today = new Date();
    const daysUntilCheckIn = Math.ceil((checkInDate - today) / (1000 * 60 * 60 * 24));
    
    let refundAmount = 0;
    let cancellationFee = 0;
    
    if (booking.userType === 'homeowner') {
      refundAmount = 0; // No money was charged
    } else {
      if (daysUntilCheckIn >= 7) {
        refundAmount = booking.totalCost;
      } else if (daysUntilCheckIn >= 3) {
        refundAmount = booking.totalCost * 0.5;
        cancellationFee = booking.totalCost * 0.5;
      } else if (daysUntilCheckIn >= 1) {
        refundAmount = booking.totalCost * 0.25;
        cancellationFee = booking.totalCost * 0.75;
      } else {
        refundAmount = 0;
        cancellationFee = booking.totalCost;
      }
    }

    const updatedBooking = {
      ...booking,
      status: 'cancelled',
      cancellationDate: new Date().toISOString().split('T')[0],
      cancellationReason: cancellationReason,
      refundAmount: refundAmount,
      paymentStatus: booking.userType === 'homeowner' ? 'exempt' : 
                     refundAmount === booking.totalCost ? 'refunded' : 
                     refundAmount > 0 ? 'partially_refunded' : 'non_refundable'
    };

    setBookings(bookings.map(b => b.id === booking.id ? updatedBooking : b));
    
    // Add notification
    setNotifications([...notifications, {
      id: Date.now(),
      type: 'cancellation',
      recipient: 'Admin',
      subject: `Booking Cancelled - ${booking.slipName}`,
      message: `${booking.guestName} has cancelled their booking for ${booking.checkIn} to ${booking.checkOut}. Reason: ${cancellationReason}. Refund: $${(refundAmount || 0).toFixed(2)}`,
      timestamp: new Date().toLocaleString()
    }]);

    setShowCancellationModal(null);
    setCancellationReason('');
    
    if (booking.userType === 'homeowner') {
      alert('Booking cancelled successfully. No charges were applied.');
    } else {
      alert(`Booking cancelled. Refund amount: $${(refundAmount || 0).toFixed(2)}${cancellationFee > 0 ? ` (Cancellation fee: $${(cancellationFee || 0).toFixed(2)})` : ''}`);
    }
  };

  const generatePermit = (booking) => {
    return {
      permitNumber: `NSP-${booking.id?.substring(0, 8) || 'UNKNOWN'}-${new Date().getFullYear()}`,
      slipName: booking.slipName || `Slip ${booking.slipId?.substring(0, 8) || 'Unknown'}`,
      guestName: booking.guestName || booking.guest_name || 'N/A',
      boatLength: booking.boatLength || booking.boat_length || null,
      boatMakeModel: booking.boatMakeModel || booking.boat_make_model || 'N/A',
      checkIn: booking.checkIn || booking.check_in || null,
      checkOut: booking.checkOut || booking.check_out || null,
      validUntil: booking.checkOut || booking.check_out || null,
      issueDate: new Date().toLocaleDateString(),
    };
  };

  const downloadPermitPDF = (booking) => {
    const permit = generatePermit(booking);
    const checkInDate = permit.checkIn ? new Date(permit.checkIn).toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    }) : 'N/A';
    const checkOutDate = permit.checkOut ? new Date(permit.checkOut).toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    }) : 'N/A';

    // Create HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @media print {
            @page { margin: 0.5in; }
          }
          body { font-family: Arial, sans-serif; max-width: 8.5in; margin: 0 auto; padding: 20px; }
          .permit { background: white; border: 4px solid #059669; padding: 40px; margin: 20px 0; text-align: center; }
          .permit-title { font-size: 36px; font-weight: bold; color: #059669; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 3px; }
          .permit-number { font-size: 16px; color: #6b7280; margin-bottom: 30px; }
          .permit-info { font-size: 20px; margin: 15px 0; color: #1f2937; font-weight: 500; }
          .permit-label { font-size: 14px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
          .section { border-top: 2px solid #059669; margin: 25px 0; padding-top: 25px; }
          .header-text { text-align: center; margin-bottom: 30px; }
          .footer-text { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="header-text">
          <h1 style="color: #059669; margin: 0;">Dock82</h1>
          <p style="color: #6b7280; margin: 5px 0;">Dock Slip Rental Permit</p>
        </div>
        
        <div class="permit">
          <div class="permit-title">DOCK PERMIT</div>
          <div class="permit-number">Permit Number: ${permit.permitNumber}</div>
          
          <div class="section">
            <div class="permit-label">Slip Assignment</div>
            <div class="permit-info">${permit.slipName}</div>
          </div>
          
          <div class="section">
            <div class="permit-label">Guest Name</div>
            <div class="permit-info">${permit.guestName}</div>
          </div>
          
          <div class="section">
            <div class="permit-label">Boat Information</div>
            <div class="permit-info">${permit.boatMakeModel}${permit.boatLength ? ` (${permit.boatLength} ft)` : ''}</div>
          </div>
          
          <div class="section">
            <div class="permit-label">Check-In Date</div>
            <div class="permit-info">${checkInDate}</div>
          </div>
          
          <div class="section">
            <div class="permit-label">Check-Out Date</div>
            <div class="permit-info">${checkOutDate}</div>
          </div>
          
          <div class="section">
            <div class="permit-label">Valid Until</div>
            <div class="permit-info">${checkOutDate}</div>
          </div>
        </div>
        
        <div class="footer-text">
          <p><strong>Instructions:</strong> Please display this permit in your vehicle's windshield at all times during your stay.</p>
          <p>Issued on: ${permit.issueDate}</p>
        </div>
      </body>
      </html>
    `;

    // Create a new window with the HTML content
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        // Optionally close the window after printing
        // printWindow.close();
      }, 250);
    };
  };

  const handleEditDescription = (slip) => {
    setEditingSlip(slip);
    setEditingDescription(slip.description || '');
  };

  const handleSaveDescription = async () => {
    if (editingSlip) {
      try {
        // Save to database
        const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/slips`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update-slip',
            slipId: editingSlip.id,
            slipData: {
              name: editingSlip.name,
              description: editingDescription,
              price_per_night: editingSlip.price_per_night,
              images: editingSlip.images
            }
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state
            const updatedSlips = slips.map(slip => 
              slip.id === editingSlip.id 
                ? { ...slip, description: editingDescription }
                : slip
            );
            setSlips(updatedSlips);
            setEditingSlip(null);
            setEditingDescription('');
            alert('✅ Slip description updated successfully!');
          } else {
            alert('❌ Failed to update slip: ' + result.error);
          }
        } else {
          throw new Error('Failed to update slip');
        }
      } catch (error) {
        console.error('Error updating slip:', error);
        alert('❌ Failed to update slip. Please try again.');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingSlip(null);
    setEditingDescription('');
    setEditingImage('');
    setImageFile(null);
  };

  const handleEditPrice = (slip) => {
    setEditingSlip(slip);
    setEditingPrice(slip.price_per_night.toString());
  };

  const handleSavePrice = async () => {
    if (editingSlip && editingPrice) {
      try {
        // Save to database
        const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/slips`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update-slip',
            slipId: editingSlip.id,
            slipData: {
              name: editingSlip.name,
              description: editingSlip.description,
              price_per_night: parseFloat(editingPrice),
              images: editingSlip.images
            }
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state
            const updatedSlips = slips.map(slip => 
              slip.id === editingSlip.id 
                ? { ...slip, price_per_night: parseFloat(editingPrice) }
                : slip
            );
            setSlips(updatedSlips);
            setEditingSlip(null);
            setEditingPrice('');
            alert('✅ Slip price updated successfully!');
          } else {
            alert('❌ Failed to update slip: ' + result.error);
          }
        } else {
          throw new Error('Failed to update slip');
        }
      } catch (error) {
        console.error('Error updating slip:', error);
        alert('❌ Failed to update slip. Please try again.');
      }
    }
  };




  const handleApproveBooking = async (bookingId) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to approve booking:', errorData);
        alert(`Failed to approve booking. ${errorData.error || 'Please try again.'}`);
        return;
      }

      const result = await response.json();
      const updated = result.booking;
      if (!updated) {
        return;
      }

      const slip = slips.find(s => s.id === updated.slip_id);
      const normalizedBooking = {
        ...updated,
        slipName: slip ? slip.name : updated.slip_name || `Slip ${updated.slip_id?.substring(0, 8)}`,
        slipId: updated.slip_id,
        guestName: updated.guest_name,
        guestEmail: updated.guest_email,
        guestPhone: updated.guest_phone,
        checkIn: updated.check_in,
        checkOut: updated.check_out,
        boatLength: updated.boat_length,
        boatMakeModel: updated.boat_make_model,
        userType: updated.user_type,
        totalCost: updated.total_cost,
        bookingDate: updated.booking_date,
        paymentStatus: updated.payment_status,
        paymentMethod: updated.payment_method,
        paymentDate: updated.payment_date,
        paymentReference: updated.payment_reference,
        rentalAgreementName: updated.rental_agreement_name,
        rentalAgreementPath: updated.rental_agreement_path,
        insuranceProofName: updated.insurance_proof_name,
        insuranceProofPath: updated.insurance_proof_path,
        boatPicturePath: updated.boat_picture_path,
        paymentIntentId: updated.payment_reference,
        status: updated.status,
        user_id: updated.user_id
      };

      setBookings(prev => prev.map(b => b.id === bookingId ? normalizedBooking : b));

      alert('Booking approved. Confirmation and permit emails have been sent to the renter.');
    } catch (error) {
      console.error('Error approving booking:', error);
      alert('Failed to approve booking. Please try again.');
    }
  };

  const handleViewDocument = async (booking, docType) => {
    if (!booking || !booking.id) {
      return;
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/bookings/${booking.id}/documents?type=${docType}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch document URL:', errorData);
        alert('Unable to load document. It may no longer be available.');
        return;
      }

      const result = await response.json();
      if (result.url) {
        window.open(result.url, '_blank', 'noopener');
      } else {
        alert('Document URL not available.');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
      alert('Failed to load document. Please try again.');
    }
  };

  const handleCancelBooking = async (bookingId) => {
    const reason = window.prompt('Provide a reason for cancellation (optional):', '');
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to cancel booking:', errorData);
        alert(`Failed to cancel booking. ${errorData.error || 'Please try again.'}`);
        return;
      }

      const result = await response.json();
      const updated = result.booking;
      const slip = slips.find(s => s.id === updated?.slip_id);

      const normalizedBooking = {
        ...updated,
        slipName: slip ? slip.name : updated?.slip_name || `Slip ${updated?.slip_id?.substring(0, 8)}`,
        slipId: updated?.slip_id,
        guestName: updated?.guest_name,
        guestEmail: updated?.guest_email,
        guestPhone: updated?.guest_phone,
        checkIn: updated?.check_in,
        checkOut: updated?.check_out,
        boatLength: updated?.boat_length,
        boatMakeModel: updated?.boat_make_model,
        userType: updated?.user_type,
        totalCost: updated?.total_cost,
        bookingDate: updated?.booking_date,
        paymentStatus: updated?.payment_status,
        paymentMethod: updated?.payment_method,
        paymentDate: updated?.payment_date,
        paymentReference: updated?.payment_reference,
        rentalAgreementName: updated?.rental_agreement_name,
        rentalAgreementPath: updated?.rental_agreement_path,
        insuranceProofName: updated?.insurance_proof_name,
        insuranceProofPath: updated?.insurance_proof_path,
        boatPicturePath: updated?.boat_picture_path,
        paymentIntentId: updated?.payment_reference,
        status: updated?.status,
        cancellationReason: updated?.cancellation_reason,
        user_id: updated?.user_id
      };

      setBookings(prev => prev.map(b => b.id === bookingId ? normalizedBooking : b));

      // Mark slip as available again locally
      if (updated?.slip_id) {
        setSlips(prev => prev.map(slipItem => slipItem.id === updated.slip_id ? { ...slipItem, available: true } : slipItem));
      }

      alert('Booking has been cancelled and the renter has been notified.');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again.');
    }
  };

  const calculateRevenue = () => {
    return bookings
      .filter(booking => booking.status === 'confirmed' && booking.userType === 'renter')
      .reduce((total, booking) => {
        const nights = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
        const slip = slips.find(s => s.name === booking.slipName);
        return total + (nights * (slip?.price_per_night || 0));
      }, 0);
  };

  const getMonthlyRevenue = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    return bookings
      .filter(booking => {
        const bookingDate = new Date(booking.checkIn);
        return booking.status === 'confirmed' && 
               booking.userType === 'renter' &&
               bookingDate.getMonth() === currentMonth &&
               bookingDate.getFullYear() === currentYear;
      })
      .reduce((total, booking) => {
        const nights = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
        const slip = slips.find(s => s.name === booking.slipName);
        return total + (nights * (slip?.price_per_night || 0));
      }, 0);
  };

  // Payment processing functions
  const processPayment = async (bookingData, totalCost) => {
    setPaymentProcessing(true);
    setPaymentError(null);
    
    try {
      // Create payment intent on backend
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: totalCost,
          currency: 'usd',
          bookingData: bookingData
        }),
      });
      
      const { clientSecret } = await response.json();
      
      // For now, just return success - the actual payment will be handled by PaymentComponent
      setPaymentProcessing(false);
      return { success: true, clientSecret };
    } catch (error) {
      setPaymentError(error.message);
      setPaymentProcessing(false);
      return { success: false, error: error.message };
    }
  };

  // Payment method is now fixed to Stripe
  const handlePaymentMethodChange = (method) => {
    // No longer needed - only Stripe is supported
    console.log('Payment method change requested:', method);
    // Could be used for future payment method support if needed
  };

  const handlePaymentComplete = async (paymentResult) => {
    try {
      // Get current user data for the booking
      const { data: userData } = await supabase.auth.getUser();
      
      // Get user_id from the users table (not auth user ID)
      // currentUser.id should be the users table ID if profile was fetched
      let userId = null;
      if (currentUser && currentUser.id) {
        // Check if this is a UUID (users table ID) or auth user ID
        // If currentUser was set from userProfile, it should have the users table ID
        // If it's from minimalUser, we need to look it up by email
        if (currentUser.email) {
          try {
            // Try to get user profile from backend to get the users table ID
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
            const profileResponse = await fetch(`${apiUrl}/api/user-profile?email=${encodeURIComponent(currentUser.email)}`);
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              if (profileData.success && profileData.profile && profileData.profile.id) {
                userId = profileData.profile.id;
              }
            }
          } catch (err) {
            console.warn('Could not fetch user profile for user_id, proceeding without it:', err);
          }
        }
        // Fallback: if currentUser.id looks like a UUID and we couldn't get profile, use it
        // (assuming it's from the users table)
        if (!userId && currentUser.id && typeof currentUser.id === 'string' && currentUser.id.length === 36) {
          userId = currentUser.id;
        }
      }
      
      // Calculate totals
      const nights = Math.ceil((new Date(bookingData.checkOut) - new Date(bookingData.checkIn)) / (1000 * 60 * 60 * 24));
      const baseTotal = nights * selectedSlip.price_per_night;
      const discount = nights === 30 ? baseTotal * 0.4 : 0; // 40% discount for 30-day bookings
      const finalTotal = bookingData.userType === 'homeowner'
        ? 0
        : baseTotal - discount;

      // Upload files to Supabase Storage before creating booking
      let rentalAgreementPath = null;
      let insuranceProofPath = null;
      let homeownerAuthorizationPath = null;
      let homeownerInsurancePath = null;
      let boatPicturePath = null;
      const authUserId = userData?.user?.id;

      try {
        if (bookingData.userType === 'renter') {
          if (bookingData.rentalAgreement && authUserId) {
            const uploadResult = await uploadUserDocument(bookingData.rentalAgreement, authUserId, 'rental-agreement');
            if (uploadResult.success) {
              rentalAgreementPath = uploadResult.filePath;
            }
          }

          if (bookingData.insuranceProof && authUserId) {
            const uploadResult = await uploadUserDocument(bookingData.insuranceProof, authUserId, 'insurance-proof');
            if (uploadResult.success) {
              insuranceProofPath = uploadResult.filePath;
            }
          }
        }

        if (bookingData.userType === 'homeowner' && authUserId) {
          if (bookingData.homeownerAuthorizationLetter) {
            const uploadResult = await uploadUserDocument(bookingData.homeownerAuthorizationLetter, authUserId, 'homeowner-authorization');
            if (uploadResult.success) {
              homeownerAuthorizationPath = uploadResult.filePath;
            }
          }

          if (bookingData.homeownerInsuranceProof) {
            const uploadResult = await uploadUserDocument(bookingData.homeownerInsuranceProof, authUserId, 'homeowner-insurance');
            if (uploadResult.success) {
              homeownerInsurancePath = uploadResult.filePath;
            }
          }
        }

        if (bookingData.boatPicture && authUserId) {
          const uploadResult = await uploadUserDocument(bookingData.boatPicture, authUserId, 'boat-picture');
          if (uploadResult.success) {
            boatPicturePath = uploadResult.filePath;
          }
        }
      } catch (uploadError) {
        console.error('❌ Error uploading files:', uploadError);
      }

      const rentalAgreementName = bookingData.userType === 'homeowner'
        ? bookingData.homeownerAuthorizationLetter?.name || null
        : bookingData.rentalAgreement?.name || null;
      const finalRentalAgreementPath = bookingData.userType === 'homeowner'
        ? homeownerAuthorizationPath
        : rentalAgreementPath;

      const insuranceProofName = bookingData.userType === 'homeowner'
        ? bookingData.homeownerInsuranceProof?.name || null
        : bookingData.insuranceProof?.name || null;
      const finalInsuranceProofPath = bookingData.userType === 'homeowner'
        ? homeownerInsurancePath
        : insuranceProofPath;

      // Insert booking through backend API (bypasses RLS)
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const createResponse = await fetch(`${apiUrl}/api/create-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        slip_id: selectedSlip.id,
          user_id: userId,
        guest_name: bookingData.guestName,
        guest_email: bookingData.guestEmail,
        guest_phone: bookingData.guestPhone,
        user_type: bookingData.userType,
        check_in: bookingData.checkIn,
        check_out: bookingData.checkOut,
        boat_length: bookingData.boatLength,
        boat_make_model: bookingData.boatMakeModel,
          nights,
        total_cost: finalTotal,
          status: bookingData.userType === 'homeowner' ? 'confirmed' : 'pending',
          payment_status: bookingData.userType === 'homeowner' ? 'paid' : 'paid',
        payment_date: new Date().toISOString(),
          payment_method: bookingData.userType === 'homeowner' ? 'exempt' : 'stripe',
          payment_reference: paymentResult.paymentIntentId,
          rental_agreement_name: rentalAgreementName,
          rental_agreement_path: finalRentalAgreementPath,
          insurance_proof_name: insuranceProofName,
          insurance_proof_path: finalInsuranceProofPath,
          boat_picture_path: boatPicturePath
        })
      });

      if (createResponse.status === 409) {
        const conflict = await createResponse.json().catch(() => ({}));
        alert(conflict.error || 'This slip has just been booked for those dates. Please choose a different date range.');
          setShowPaymentPage(false);
          setCurrentView('browse');
          return;
        }
        
      if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({}));
        console.error('Database insert error (API):', err);
        if (err?.details?.includes('Overlapping')) {
          alert('This slip is already booked for those dates! Please choose different dates.');
          setShowPaymentPage(false);
          setCurrentView('browse');
          return;
        }
        // Fallback: add to local state
        const tempBooking = {
          id: Date.now(),
          slipId: selectedSlip.id,
          slipName: selectedSlip.name,
          ...bookingData,
          nights,
          totalCost: finalTotal,
          status: bookingData.userType === 'homeowner' ? 'confirmed' : 'pending',
          paymentStatus: 'paid',
          rentalAgreementName: rentalAgreementName,
          rentalAgreementPath: finalRentalAgreementPath,
          insuranceProofName: insuranceProofName,
          insuranceProofPath: finalInsuranceProofPath,
          boatPicturePath: boatPicturePath,
          paymentIntentId: paymentResult.paymentIntentId
        };
        setBookings([...bookings, tempBooking]);
        setAllBookings([...allBookings, tempBooking]);
        setShowPaymentPage(false);
        setCurrentView('browse');
        return;
      }

      const created = await createResponse.json();
      const newBookingData = created.booking;
      console.log('Booking inserted successfully via API:', newBookingData);

      // Update slip availability in database via backend API (bypasses RLS)
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
        const updateResponse = await fetch(`${apiUrl}/api/slips/${selectedSlip.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ available: false })
        });
        
        if (!updateResponse.ok) {
          const errorData = await updateResponse.json().catch(() => ({}));
          console.error('Failed to update slip availability:', errorData);
        } else {
          console.log('Slip availability updated to occupied');
        }
      } catch (error) {
        console.error('Error updating slip availability:', error);
      }

      // Update local bookings state with confirmed booking
      const [normalizedBooking] = transformBookingsData([newBookingData], allSlips.length ? allSlips : slips);

      setBookings([...bookings, normalizedBooking]);
      setAllBookings([...allBookings, normalizedBooking]);
      
      // Update local slips state to mark slip as occupied
      setSlips(prevSlips => 
        prevSlips.map(slip => 
          slip.id === selectedSlip.id 
            ? { ...slip, available: false }
            : slip
        )
      );
      setAllSlips(prevSlips => 
        prevSlips.map(slip => 
          slip.id === selectedSlip.id 
            ? { ...slip, available: false }
            : slip
        )
      );
      
      setShowPaymentPage(false);
      setCurrentView('browse');
      
      // Send confirmation emails
      if (bookingData.userType === 'renter') {
      await sendEmailNotification('paymentReceipt', bookingData.guestEmail, {
        guestName: bookingData.guestName,
        slipName: selectedSlip.name,
        paymentIntentId: paymentResult.paymentIntentId,
        amount: finalTotal,
        paymentMethod: paymentResult.paymentMethod || 'stripe'
      });
      }
      
      await sendEmailNotification('bookingPending', bookingData.guestEmail, {
        guestName: bookingData.guestName,
        slipName: selectedSlip.name,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        boatMakeModel: bookingData.boatMakeModel,
        boatLength: bookingData.boatLength,
        totalAmount: finalTotal
      });

      alert('Payment successful! Your booking request has been submitted for approval. You will receive a confirmation email once it is approved.');
    } catch (error) {
      console.error('Payment completion error:', error);
      alert('Payment processed but there was an error completing the booking. Please contact support.');
    }
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!selectedSlip || !bookingData.checkIn || !bookingData.checkOut || 
        !bookingData.guestName || !bookingData.guestEmail || !bookingData.guestPhone ||
        !bookingData.boatLength || !bookingData.boatMakeModel) {
      alert('Please fill in all required fields.');
      return;
    }

    // Date validation
    const dateValidation = validateDates(bookingData.checkIn, bookingData.checkOut);
    if (!dateValidation.valid) {
      alert(dateValidation.message);
      return;
    }

    // Check if slip is still available for the selected dates
    if (!isSlipAvailableForDates(selectedSlip.id, bookingData.checkIn, bookingData.checkOut)) {
      alert('This slip is no longer available for the selected dates. Please choose different dates or another slip.');
      return;
    }

    // Homeowners must agree to terms
    if (bookingData.userType === 'homeowner' && !bookingData.agreedToTerms) {
      alert('Please read and agree to the dock etiquette guidelines before proceeding.');
      return;
    }

    // Only renters need to upload rental agreement and provide rental details
    // Simplified validation - just check required fields
    if (bookingData.userType === 'renter' && (!bookingData.rentalAgreement || !bookingData.insuranceProof)) {
      alert('Please upload both your rental agreement and boat insurance proof.');
      return;
    }

    if (bookingData.userType === 'homeowner' && !bookingData.homeownerAuthorizationLetter) {
      alert('Please upload your homeowner authorization letter.');
      return;
    }

    if (parseInt(bookingData.boatLength) > selectedSlip.max_length) {
      alert(`Boat length cannot exceed ${selectedSlip.max_length} feet for this dock slip.`);
      return;
    }

    const totalInfo = calculateBookingTotal(bookingData.checkIn, bookingData.checkOut, selectedSlip.price_per_night);
    const totalCost = bookingData.userType === 'homeowner' ? 0 : totalInfo.finalTotal;

    // For renters, show payment page instead of processing payment directly
    if (bookingData.userType === 'renter') {
      setShowPaymentPage(true);
      return;
    }

    await handlePaymentComplete({
      paymentIntentId: `homeowner-${Date.now()}`,
      totalAmount: totalCost,
      paymentMethod: 'exempt'
    });
  };

  // Helper function to sort slips: "Dockmaster Slip" first, then "Slip 1", "Slip 2", etc.
  const sortSlips = (slipsArray) => {
    return [...slipsArray].sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      
      // "Dockmaster Slip" always comes first
      if (nameA.toLowerCase().includes('dockmaster')) return -1;
      if (nameB.toLowerCase().includes('dockmaster')) return 1;
      
      // Extract numbers from "Slip X" format
      const numA = parseInt(nameA.match(/\d+/)?.[0] || '999');
      const numB = parseInt(nameB.match(/\d+/)?.[0] || '999');
      
      // If both have numbers, sort by number
      if (numA !== 999 && numB !== 999) {
        return numA - numB;
      }
      
      // Otherwise sort alphabetically
      return nameA.localeCompare(nameB);
    });
  };

  // Helper function to check if slip is available for date range
  const isSlipAvailableForDateRange = (slip, startDate, endDate) => {
    if (!startDate || !endDate) return true; // If no date range selected, show all
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if slip has any overlapping bookings
    const hasOverlap = bookings.some(booking => {
      if (booking.slipId !== slip.id && booking.slip_id !== slip.id) return false;
      if (booking.status === 'cancelled') return false;
      
      const bookingStart = new Date(booking.checkIn || booking.check_in);
      const bookingEnd = new Date(booking.checkOut || booking.check_out);
      
      // Check for overlap: booking overlaps if it starts before our end and ends after our start
      return bookingStart < end && bookingEnd > start;
    });
    
    return !hasOverlap;
  };

  const filteredSlips = sortSlips(slips.filter(slip => {
    // Filter by max length
    if (searchFilters.maxLength && parseInt(searchFilters.maxLength) > slip.max_length) return false;
    
    // Filter by price range
    if (searchFilters.priceRange) {
      const [min, max] = searchFilters.priceRange.split('-').map(Number);
      if (slip.price_per_night < min || slip.price_per_night > max) return false;
    }
    
    // Filter by date range availability
    if (searchFilters.dateRangeStart && searchFilters.dateRangeEnd) {
      if (!isSlipAvailableForDateRange(slip, searchFilters.dateRangeStart, searchFilters.dateRangeEnd)) {
        return false;
      }
    }
    
    return true;
  }));

  const SlipCard = ({ slip }) => {
    // Helper function to format dimension values
    const formatDimension = (value) => {
      if (value == null || isNaN(value)) return 'N/A';
      return `${value}ft`;
    };

    // Helper function to get the first image from the images array
    const getFirstImage = (slip) => {
      console.log('DEBUG SlipCard - slip data:', slip);
      console.log('DEBUG SlipCard - slip.images:', slip.images);
      console.log('DEBUG SlipCard - slip.image_url:', slip.image_url);
      
      // Check if images is an array with content
      if (slip.images && Array.isArray(slip.images) && slip.images.length > 0) {
        console.log('DEBUG SlipCard - using images array, first image:', slip.images[0]);
        return slip.images[0];
      }
      
      // Check if images is a string (direct base64 data)
      if (slip.images && typeof slip.images === 'string' && slip.images.startsWith('data:image/')) {
        console.log('DEBUG SlipCard - using images string directly:', slip.images);
        return slip.images;
      }
      
      // Fallback to image_url for backward compatibility
      console.log('DEBUG SlipCard - using image_url fallback:', slip.image_url);
      return slip.image_url;
    };

    const imageSrc = getFirstImage(slip);
    console.log('DEBUG SlipCard - final imageSrc:', imageSrc);

    const isDateFilterActive = Boolean(searchFilters.dateRangeStart && searchFilters.dateRangeEnd);
    const slipAvailableForRange = isSlipAvailableForDateRange(
      slip,
      searchFilters.dateRangeStart,
      searchFilters.dateRangeEnd
    );

    const availabilityBadgeClass = isDateFilterActive
      ? (slipAvailableForRange ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')
      : 'bg-gray-100 text-gray-600';

    const availabilityBadgeLabel = isDateFilterActive
      ? (slipAvailableForRange ? 'Available' : 'Unavailable')
      : 'Select dates to check availability';

    const slipBookings = bookings.filter((booking) => {
      const slipId = booking.slipId || booking.slip_id;
      if (slipId !== slip.id) return false;
      const status = (booking.status || '').toLowerCase();
      return status !== 'cancelled' && status !== 'canceled';
    });

    const renderAvailabilityCalendar = () => {
      if (!slipBookings.length) {
        return (
          <div className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-500">
            No upcoming bookings on record for this slip.
          </div>
        );
      }

      const referenceDate = isDateFilterActive
        ? new Date(searchFilters.dateRangeStart)
        : new Date();
      const displayMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      const year = displayMonth.getFullYear();
      const month = displayMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDayOfMonth = new Date(year, month, 1).getDay();

      const normalizeDate = (date) => {
        const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        normalized.setHours(0, 0, 0, 0);
        return normalized;
      };

      const bookingMatchesDate = (date) => {
        return slipBookings.find((booking) => {
          const startRaw = booking.checkIn || booking.check_in;
          const endRaw = booking.checkOut || booking.check_out;
          if (!startRaw || !endRaw) return false;
          const startDate = normalizeDate(new Date(startRaw));
          const endDate = normalizeDate(new Date(endRaw));
          if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
          return startDate <= date && date < endDate;
        });
      };

      const isWithinSelectedRange = (date) => {
        if (!isDateFilterActive) return false;
        const startDate = normalizeDate(new Date(searchFilters.dateRangeStart));
        const endDate = normalizeDate(new Date(searchFilters.dateRangeEnd));
        return date >= startDate && date < endDate;
      };

      const weeks = [];
      let currentDay = 1 - firstDayOfMonth;

      for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
        const week = [];
        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1, currentDay += 1) {
          if (currentDay < 1 || currentDay > daysInMonth) {
            week.push(null);
          } else {
            const cellDate = normalizeDate(new Date(year, month, currentDay));
            const bookingMatch = bookingMatchesDate(cellDate);
            const isDisabled = Boolean(bookingMatch);
            const inSelectedRange = isWithinSelectedRange(cellDate);
            let tooltip = '';
            if (bookingMatch) {
              const startLabel = new Date(bookingMatch.checkIn || bookingMatch.check_in).toLocaleDateString();
              const endLabel = new Date(bookingMatch.checkOut || bookingMatch.check_out).toLocaleDateString();
              tooltip = `Booked from ${startLabel} to ${endLabel}`;
            }

            week.push({
              dayNumber: currentDay,
              isDisabled,
              inSelectedRange,
              tooltip
            });
          }
        }
        weeks.push(week);
      }

      const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      return (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
            <span>{displayMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
            <span className="text-xs text-gray-500">Gray dates are already booked</span>
          </div>
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr>
                {weekdayLabels.map((label) => (
                  <th key={label} className="py-1 text-gray-500 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIdx) => (
                <tr key={`week-${weekIdx}`}>
                  {week.map((dayInfo, dayIdx) => {
                    if (!dayInfo) {
                      return (
                        <td
                          key={`empty-${weekIdx}-${dayIdx}`}
                          className="h-8 border border-gray-100 bg-gray-50"
                        />
                      );
                    }

                    let cellClasses = 'h-8 border border-gray-100 align-middle';

                    if (dayInfo.isDisabled) {
                      cellClasses += ' bg-gray-200 text-gray-400 cursor-not-allowed';
                    } else {
                      cellClasses += ' bg-white text-gray-700';
                    }

                    if (dayInfo.inSelectedRange && !dayInfo.isDisabled) {
                      cellClasses += ' ring-2 ring-blue-400 font-semibold';
                    }

                    return (
                      <td
                        key={`day-${weekIdx}-${dayIdx}`}
                        className={cellClasses}
                        title={dayInfo.tooltip || undefined}
                      >
                        {dayInfo.dayNumber}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-white border border-gray-200" />
              Available
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-gray-200 border border-gray-200" />
              Booked
            </span>
            {isDateFilterActive && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" />
                Selected range
              </span>
            )}
          </div>
        </div>
      );
    };
    
    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
        {imageSrc && (
          <img 
            src={imageSrc} 
            alt={slip.name}
            className="w-full h-48 object-cover"
          />
        )}
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold">{slip.name}</h3>
            <span className={`px-2 py-1 rounded text-sm ${availabilityBadgeClass}`}>
              {availabilityBadgeLabel}
          </span>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center text-sm text-gray-500">
            <Anchor className="w-4 h-4 mr-2" />
              Max Length: {formatDimension(slip.max_length)} | Width: {formatDimension(slip.width)} | Depth: {formatDimension(slip.depth)}
          </div>
          <div className="flex items-center text-sm text-gray-500">
            <DollarSign className="w-4 h-4 mr-2" />
            ${slip.price_per_night}/night
          </div>
        </div>

        <div className="mb-3">
          <div className="flex flex-wrap gap-1">
            {slip.amenities.map((amenity, idx) => (
              <span key={idx} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                {amenity}
              </span>
            ))}
          </div>
        </div>

          {renderAvailabilityCalendar()}

          {(isDateFilterActive ? slipAvailableForRange : slip.available) && (
          <button
            onClick={() => {
              setSelectedSlip(slip);
              setCurrentView('booking');
            }}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Book This Slip
          </button>
        )}
      </div>
    </div>
  );
  };

  // User authentication functions
  // FIXED DOCK82 AUTHENTICATION FLOW
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    
    console.log('AUTH DEBUG - handleEmailSubmit called with email:', tempEmail);
    
    if (!tempEmail) {
      alert('Please enter your email address.');
      return;
    }

    try {
      // Check if email exists using backend API (bypasses RLS)
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${localApiUrl}/api/user-profile?email=${encodeURIComponent(tempEmail.toLowerCase().trim())}`);
      
      if (!response.ok) {
        console.error('AUTH DEBUG - Error checking email via API:', response.status);
        alert('Error checking email. Please try again.');
        return;
      }
      
      const result = await response.json();

      if (result.success && result.profile) {
        // User exists - show welcome back message and proceed to password
        console.log('AUTH DEBUG - User found:', result.profile);
        const userName = result.profile.name || tempEmail.split('@')[0];
        alert(`Welcome back, ${userName}! Please enter your password to continue.`);
        // Email found, but we'll use the combined login form, so just set the email
        setLoginData({ ...loginData, email: tempEmail.toLowerCase().trim() });
        // Keep authStep as 'login' - user will enter password in the same form
      } else {
        // User doesn't exist - prompt to register
        console.log('AUTH DEBUG - User not found, prompting for registration');
        const shouldRegister = window.confirm(
          `You are not registered yet. Would you like to create an account with ${tempEmail}?\n\n` +
          `Click OK to register, or Cancel to try a different email.`
        );
        
        if (shouldRegister) {
          // Proceed to registration step
          setAuthStep('register');
          setRegisterData({ ...registerData, email: tempEmail.toLowerCase().trim() });
        } else {
          // Clear email and let them try again
          setTempEmail('');
        }
      }
    } catch (error) {
      console.error('AUTH DEBUG - Unexpected error checking email:', error);
      alert('An error occurred. Please try again.');
    }
  };

  // FIXED PASSWORD LOGIN LOGIC - Now checks if user exists first, then logs in
  const handleLogin = async (e) => {
    e.preventDefault();
    
    console.log('AUTH DEBUG - handleLogin called');
    console.log('AUTH DEBUG - Email:', loginData.email);
    
    if (!loginData.email || !loginData.password) {
      alert('Please enter both email and password.');
      return;
    }

    // First check if user exists in the users table
    try {
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${localApiUrl}/api/user-profile?email=${encodeURIComponent(loginData.email.toLowerCase().trim())}`);
      
      if (!response.ok) {
        console.error('AUTH DEBUG - Error checking email via API:', response.status);
        alert('Error checking email. Please try again.');
        return;
      }
      
      const result = await response.json();

      if (!result.success || !result.profile) {
        // User doesn't exist - prompt to register
        const shouldRegister = window.confirm(
          `You are not registered yet. Would you like to create an account with ${loginData.email}?\n\n` +
          `Click OK to register, or Cancel to try a different email.`
        );
        
        if (shouldRegister) {
          // Proceed to registration step
          setRegisterData({ ...registerData, email: loginData.email.toLowerCase().trim() });
          setAuthStep('register');
        } else {
          // Clear email and let them try again
          setLoginData({ email: '', password: '' });
        }
        return;
      }
    } catch (error) {
      console.error('AUTH DEBUG - Error checking if user exists:', error);
      // Continue with login attempt anyway - Supabase auth will handle validation
    }

    // QUICK ADMIN LOGIN FOR GLEN (temporary)
    if (loginData.email === 'Glen@centriclearning.net' && loginData.password === 'Dock82Admin2024!') {
      console.log('AUTH DEBUG - Quick admin login successful');
      
      const userProfile = {
        id: 'admin-1',
        name: 'Glen Taylor',
        email: 'Glen@centriclearning.net',
        user_type: 'superadmin',
        phone: '555-0123',
        permissions: {
          manage_users: true,
          manage_admins: true,
          manage_slips: true,
          manage_bookings: true,
          view_analytics: true,
          system_settings: true
        }
      };
      
      setCurrentUser(userProfile);
      setShowLoginModal(false);
      setLoginData({ email: '', password: '' });
      setAdminMode(true);
      setSuperAdminMode(true);
      setAuthStep('login');
        // Set view to browse after login
        if (currentView === null || currentView === 'browse') {
          setCurrentView('browse');
        }
      
      alert('Welcome, Superadmin! You have full access to the system.');
      return;
    }

    try {
      console.log('AUTH DEBUG - Attempting Supabase Auth login');
      
      // Use Supabase Auth directly
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });

      console.log('AUTH DEBUG - Supabase auth response:', authData);
      
      if (authError) {
        console.error('AUTH DEBUG - Supabase auth error:', authError);
        
        // Handle specific auth errors
        if (authError.message.includes('Invalid login credentials')) {
          alert('Invalid email or password. Please try again.');
        } else if (authError.message.includes('Email not confirmed')) {
          console.log('AUTH DEBUG - Email not confirmed');
          alert('📧 Email verification required!\n\nPlease check your email and click the verification link to activate your account.\n\nIf you didn\'t receive the email, check your spam folder or contact support.');
          
          // Show resend verification option
          setAuthStep('resend-verification');
          return;
        } else {
          alert(`Login failed: ${authError.message}`);
        }
        return;
      }

      if (authData.user) {
        console.log('AUTH DEBUG - Login successful, user:', authData.user);
        
        // Now get or create the user profile in your users table
        let userProfile = await ensureUserProfile(authData.user);
        
        // If profile not found, create minimal user from session
        if (!userProfile) {
          console.log('AUTH DEBUG - Profile not found, creating minimal user from session');
          userProfile = {
            id: authData.user.id,
            email: authData.user.email,
            name: authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || 'User',
            user_type: normalizeUserType(authData.user.user_metadata?.userType || authData.user.user_metadata?.user_type || authData.user.user_metadata?.userRole),
            phone: authData.user.user_metadata?.phone || '',
            email_verified: authData.user.email_confirmed_at !== null
          };
        }
        userProfile.user_type = normalizeUserType(userProfile.user_type || userProfile.userType || userProfile.user_role);
        
        // Set user state
        setCurrentUser(userProfile);
        setShowLoginModal(false);
        setLoginData({ email: '', password: '' });
        
        // Set admin mode if superadmin
        if (userProfile.user_type === 'superadmin') {
          setAdminMode(true);
          setSuperAdminMode(true);
        }
        
        setAuthStep('login');
        // Set view to browse after login
        if (currentView === null || currentView === 'browse') {
          setCurrentView('browse');
        }
        
        // Load user's bookings
        const userBookings = bookings.filter(booking => 
          (booking.user_id && booking.user_id === userProfile.id) || 
          (!booking.user_id && booking.guestEmail === userProfile.email)
        );
        setUserBookings(userBookings);
        
        alert(`Welcome, ${userProfile.name}! You have ${userProfile.user_type} access.`);
      }
      
    } catch (error) {
      console.error('AUTH DEBUG - Unexpected error during login:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // FETCH USER PROFILE FROM DATABASE
  // Note: Profile creation is handled by backend API to avoid RLS recursion
  // If fetch fails due to RLS, we return null and use minimal user from session
  const ensureUserProfile = async (authUser) => {
    console.log('AUTH DEBUG - Fetching user profile for:', authUser.email);
    
    try {
      // Fetch profile from backend API (bypasses RLS)
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${localApiUrl}/api/user-profile?email=${encodeURIComponent(authUser.email)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('AUTH DEBUG - Profile fetch failed:', response.status, errorData);
        return null;
      }
      
      const result = await response.json();
      
      if (result.success && result.profile) {
        console.log('AUTH DEBUG - User profile found:', result.profile);
        if (result.created) {
          console.log('AUTH DEBUG - User profile created from Auth user');
        }
        return {
          ...result.profile,
          user_type: normalizeUserType(result.profile.user_type || result.profile.userType || result.profile.user_role)
        };
      }
      
      // Profile not found
      console.log('AUTH DEBUG - Profile not found:', result.message || 'Unknown error');
      return null;
      
    } catch (error) {
      console.error('AUTH DEBUG - Error in ensureUserProfile:', error);
      // Return null so the app can continue with minimal user
      return null;
    }
  };

  // Resend email verification
  const handleResendVerification = async () => {
    console.log('AUTH DEBUG - Resending verification email');
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: loginData.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        console.error('AUTH DEBUG - Resend error:', error);
        alert(`Failed to resend verification email: ${error.message}`);
      } else {
        alert('📧 Verification email sent!\n\nPlease check your email and click the verification link.\n\nIf you don\'t see it, check your spam folder.');
        setAuthStep('login');
      }
    } catch (error) {
      console.error('AUTH DEBUG - Unexpected error resending verification:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // FIXED REGISTRATION FOR ALL USERS
  const handleRegister = async (e) => {
    e.preventDefault();
    
    console.log('AUTH DEBUG - handleRegister called');
    
    if (!registerData.name || !registerData.email || !registerData.password || !registerData.confirmPassword) {
      alert('Please fill in all required fields.');
      return;
    }
    
    if (registerData.password !== registerData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    
    if (registerData.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    // Proceed to contact verification step
    setAuthStep('verify-contact');
  };

  // Final registration after contact verification
  const handleFinalRegistration = async () => {
    console.log('AUTH DEBUG - handleFinalRegistration called');
    
    try {
      console.log('AUTH DEBUG - Attempting Supabase Auth signup');
      
      // Register user via our API endpoint (bypasses Supabase email rate limits)
      // Uses Admin API to create user and Resend for emails (same as booking receipts)
      console.log('AUTH DEBUG - Registering user via API (bypassing Supabase email rate limits)...');
      
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      
      // Check if server is running and has the endpoint
      let registerResponse;
      try {
        registerResponse = await fetch(`${localApiUrl}/api/register-user`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
        email: registerData.email,
        password: registerData.password,
            name: registerData.name,
            phone: registerData.phone,
            userType: registerData.userType ? registerData.userType.toLowerCase() : 'renter',
            propertyAddress: registerData.propertyAddress,
            emergencyContact: registerData.emergencyContact
          })
        });
      } catch (fetchError) {
        console.error('AUTH DEBUG - Network error calling register-user endpoint:', fetchError);
        alert('⚠️ Cannot connect to registration service.\n\nPlease make sure the backend server is running on port 5001.\n\nRun: node server.js');
        return;
      }
      
      let authData = null;
      let authError = null;
      
      if (registerResponse.ok) {
        const registerResult = await registerResponse.json();
        console.log('AUTH DEBUG - User registered via API:', registerResult);
        
        // Check if this is an existing user
        if (registerResult.existingUser) {
          console.log('AUTH DEBUG - User already exists in Supabase Auth');
          
          // Check the user's current profile to see what user type they have
          try {
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
            const profileResponse = await fetch(`${apiUrl}/api/user-profile?email=${encodeURIComponent(registerData.email)}`);
            
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              
              if (profileData.success && profileData.profile) {
                const currentUserType = profileData.profile.user_type || 'renter';
                const requestedUserType = registerData.userType || 'renter';
                
                // If user type is being changed, inform the user
                if (currentUserType !== requestedUserType) {
                  alert(`✅ Your account has been updated!\n\nYour user type has been changed from '${currentUserType}' to '${requestedUserType}'.\n\nPlease log in with your existing password to continue.`);
                } else {
                  alert(`✅ Account found!\n\nAn account with this email already exists.\n\nPlease log in with your existing password to continue.`);
                }
              } else {
                // Profile not found in database, but exists in Auth
                alert(`✅ Account found!\n\nAn account with this email already exists in the system.\n\nPlease log in with your existing password. If you've forgotten your password, use the "Forgot Password" option.`);
              }
            } else {
              // Couldn't fetch profile
              alert(`✅ Account found!\n\nAn account with this email already exists.\n\nPlease log in with your existing password. If you've forgotten your password, use the "Forgot Password" option.`);
            }
          } catch (profileErr) {
            console.error('AUTH DEBUG - Error checking profile:', profileErr);
            alert(`✅ Account found!\n\nAn account with this email already exists.\n\nPlease log in with your existing password. If you've forgotten your password, use the "Forgot Password" option.`);
          }
          
          // Close registration modal and show login form
          setShowLoginModal(true);
          setAuthStep('login');
          setRegisterData({ email: '', password: '', name: '', phone: '', userType: 'renter' });
          return;
        }
        
        // New user - sign in to get the session
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: registerData.email,
          password: registerData.password
        });
        
        if (signInError || !signInData || !signInData.user) {
          authError = signInError || new Error('Failed to sign in after registration');
          console.error('AUTH DEBUG - Sign in error after registration:', authError);
          
          // If email not confirmed, user was created but needs to verify
          if (signInError && signInError.message && signInError.message.includes('Email not confirmed')) {
            console.log('AUTH DEBUG - Email not confirmed, but user was created');
            // User was created successfully, just needs to verify email
            alert('✅ Account created successfully!\n\n📧 Please check your email and click the verification link to activate your account.\n\nYou can also try logging in again after verifying your email.');
            setShowLoginModal(false);
            setAuthStep('login');
            return;
          }
        } else {
          authData = { user: signInData.user };
          console.log('AUTH DEBUG - User signed in successfully after registration');
        }
      } else {
        // Try to parse error response
        let errorData;
        let errorText = '';
        try {
          errorText = await registerResponse.text();
          errorData = errorText ? JSON.parse(errorText) : { error: 'Registration failed' };
        } catch (parseErr) {
          console.error('AUTH DEBUG - Failed to parse error response:', parseErr);
          console.error('AUTH DEBUG - Response text:', errorText);
          errorData = { error: `Registration failed (${registerResponse.status}: ${registerResponse.statusText})` };
        }
        
        // Handle 404 - endpoint not found (server needs restart)
        if (registerResponse.status === 404) {
          authError = new Error('Registration endpoint not found. Please restart the backend server (node server.js)');
        } else {
          authError = new Error(errorData.error || 'Registration failed');
        }
        
        console.error('AUTH DEBUG - Registration API error:', errorData);
        console.error('AUTH DEBUG - Response status:', registerResponse.status);
        console.error('AUTH DEBUG - Response statusText:', registerResponse.statusText);
      }

      // Handle errors from API registration
      if (authError) {
        console.error('AUTH DEBUG - Registration error:', authError);
        
        if (authError.message.includes('already') || authError.message.includes('exists')) {
          alert('This email is already registered. Please try logging in instead.');
          setAuthStep('login');
          setLoginData({ ...loginData, email: registerData.email });
          return;
        } else {
          // Real error - can't proceed
          console.error('AUTH DEBUG - Registration failed:', authError);
          alert(`Registration failed: ${authError.message}\n\nPlease try again or contact support if the problem persists.`);
          return;
        }
      }

      console.log('AUTH DEBUG - Signup response:', authData);
      
      // Check if user was created
      if (!authData || !authData.user) {
        console.error('AUTH DEBUG - No user data returned from signup');
        alert('Registration failed. Please try again.');
        return;
      }

      console.log('AUTH DEBUG - User created successfully:', authData.user.email);

      // IMPORTANT: Always create user profile in database, regardless of email confirmation status
      console.log('AUTH DEBUG - Creating user profile in database...');
      console.log('AUTH DEBUG - Auth user data:', {
        id: authData.user.id,
        email: authData.user.email,
        metadata: authData.user.user_metadata,
        confirmed: authData.user.email_confirmed_at
      });
      
      let userProfile;
      try {
        userProfile = await ensureUserProfile(authData.user);
        console.log('AUTH DEBUG - User profile fetch result:', userProfile);
        
        if (!userProfile) {
          // Profile not found - create minimal user from session
          console.log('AUTH DEBUG - Profile not found, creating minimal user from session');
          userProfile = {
            id: authData.user.id,
            email: authData.user.email,
            name: authData.user.user_metadata?.name || registerData.name || authData.user.email?.split('@')[0] || 'User',
            user_type: registerData.userType || authData.user.user_metadata?.userType || authData.user.user_metadata?.user_type || 'renter',
            phone: registerData.phone || authData.user.user_metadata?.phone || '',
            email_verified: authData.user.email_confirmed_at !== null
          };
          console.log('AUTH DEBUG - Created minimal user from session:', userProfile);
        }
        
        // Verify the profile was actually saved using backend API (bypasses RLS)
        try {
          const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
          const verifyResponse = await fetch(`${localApiUrl}/api/user-profile?email=${encodeURIComponent(authData.user.email)}`);
          
          if (!verifyResponse.ok) {
            console.error('AUTH DEBUG - Verification API call failed:', verifyResponse.status);
            throw new Error('Failed to verify user profile was saved');
          }
          
          const verifyResult = await verifyResponse.json();
          
          if (!verifyResult.success || !verifyResult.profile) {
            throw new Error('User profile not found in database after creation');
          }
          
          console.log('AUTH DEBUG - Verified user profile exists in database:', verifyResult.profile);
          userProfile = verifyResult.profile; // Use verified profile
        } catch (verifyError) {
          console.error('AUTH DEBUG - Verification failed:', verifyError);
          // Don't throw - profile was created by backend, just verification failed
          // This is likely due to timing, profile should exist
          console.warn('AUTH DEBUG - Verification failed but profile was created by backend API');
        }
        
      } catch (profileError) {
        console.error('AUTH DEBUG - Error creating/verifying user profile:', profileError);
        console.error('AUTH DEBUG - Error details:', {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint
        });
        
        // Show detailed error to user
        const errorMessage = profileError.message || 'Unknown error';
        alert(`Account created in Supabase Auth, but there was an error saving your profile to the database.\n\nError: ${errorMessage}\n\nPlease try logging in - your profile should be created automatically on first login.`);
        
          setAuthStep('login');
          setLoginData({ ...loginData, email: registerData.email });
        return;
      }

      // Send verification email via Resend (same system as booking receipts)
      if (!authData.user.email_confirmed_at) {
        console.log('AUTH DEBUG - Sending verification email via Resend (same as booking receipts)...');
        try {
          // Generate verification URL using our API endpoint
          const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
          const response = await fetch(`${localApiUrl}/api/send-verification-email`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: registerData.email,
              name: registerData.name
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('✅ AUTH DEBUG - Verification email sent via Resend:', result);
        } else {
            const errorData = await response.json();
            console.error('AUTH DEBUG - Failed to send verification email:', errorData);
            // Continue anyway - user can request verification later
            // But show them the verification URL if provided
            if (errorData.verificationUrl) {
              console.log('AUTH DEBUG - Verification URL available:', errorData.verificationUrl);
            }
          }
        } catch (emailError) {
          console.error('AUTH DEBUG - Error sending verification email via Resend:', emailError);
          // Continue anyway - user can request verification later
        }
        
        // Email verification required - user needs to verify email
        console.log('AUTH DEBUG - Email verification required, but profile is saved');
        
        setShowLoginModal(false);
        setRegisterData({ 
          name: '', 
          email: '', 
          password: '', 
          confirmPassword: '',
          phone: '',
          userType: 'renter',
          propertyAddress: '',
          emergencyContact: ''
        });
        setAuthStep('login');
        
        alert('✅ Registration successful!\n\n📧 A welcome email has been sent to ' + registerData.email + ' via Resend (check your spam folder if you don\'t see it).\n\nYou can now log in with your email and password.\n\nYour account information has been saved to the database.');
      } else {
        // Email already confirmed - log them in immediately
        console.log('AUTH DEBUG - Email already confirmed, logging in');
        setCurrentUser(userProfile);
        setShowLoginModal(false);
        setRegisterData({ 
          name: '', 
          email: '', 
          password: '', 
          confirmPassword: '',
          phone: '',
          userType: 'renter',
          propertyAddress: '',
          emergencyContact: ''
        });
        setAuthStep('login');
        
        // Set admin mode if superadmin
        if (userProfile.user_type === 'superadmin') {
          setAdminMode(true);
          setSuperAdminMode(true);
        }
        
        // Set view to browse after login
        if (currentView === null || currentView === 'browse') {
        setCurrentView('browse');
        }
        
        alert(`Welcome to Dock82, ${userProfile.name}! 🚢\n\nYour account has been created and you are now logged in.`);
      }
      
    } catch (error) {
      console.error('AUTH DEBUG - Unexpected error during registration:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      // Sign out from Supabase (this will trigger the auth state change listener)
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('AUTH DEBUG - Error signing out:', error);
        alert('Error signing out. Please try again.');
        return;
      }
      
      // Clear local state (this will also be handled by the auth state change listener)
      setCurrentUser(null);
      setAdminMode(false);
      setSuperAdminMode(false);
      setUserBookings([]);
      setCurrentView('browse');
      setAuthStep('login');
      setTempEmail('');
      setLoginData({ email: '', password: '' });
      setRegisterData({ 
        name: '', 
        email: '', 
        password: '', 
        confirmPassword: '',
        phone: '',
        userType: 'renter'
      });
      setShowProfileModal(false);
      
      console.log('AUTH DEBUG - Logout successful');
    } catch (error) {
      console.error('AUTH DEBUG - Unexpected error during logout:', error);
      alert('An unexpected error occurred during logout.');
    }
  };

  // Handle opening profile edit modal
  const handleEditProfile = () => {
    if (currentUser) {
      const resolvedUserType = normalizeUserType(currentUser.user_type || currentUser.userType || currentUser.user_role);
      setEditingProfile({
        name: currentUser.name || '',
        phone: currentUser.phone || '',
        userType: resolvedUserType,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      });
      setShowProfileModal(true);
    }
  };

  // Handle saving profile changes
  const handleSaveProfile = async () => {
    if (!currentUser) return;

    try {
      // Check if user wants to change password
      const isChangingPassword = editingProfile.currentPassword || editingProfile.newPassword || editingProfile.confirmNewPassword;
      
      if (isChangingPassword) {
        // Validate password change fields
        if (!editingProfile.currentPassword) {
          alert('Please enter your current password to change it.');
          return;
        }
        if (!editingProfile.newPassword) {
          alert('Please enter a new password.');
          return;
        }
        if (editingProfile.newPassword.length < 6) {
          alert('New password must be at least 6 characters long.');
          return;
        }
        if (editingProfile.newPassword !== editingProfile.confirmNewPassword) {
          alert('New password and confirmation do not match.');
          return;
        }

        // Update password using Supabase Auth
        const { error: passwordError } = await supabase.auth.updateUser({
          password: editingProfile.newPassword
        });

        if (passwordError) {
          console.error('Password update error:', passwordError);
          alert(`Failed to update password: ${passwordError.message}`);
          return;
        }
      }

      const normalizedUserType = normalizeUserType(editingProfile.userType);

      // Update user profile data in database
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          name: editingProfile.name,
          phone: editingProfile.phone,
          user_type: normalizedUserType,
          updated_at: new Date().toISOString()
        })
        .eq('email', currentUser.email)
        .select()
        .single();

      if (updateError) {
        console.error('Profile update error:', updateError);
        alert(`Failed to update profile: ${updateError.message}`);
        return;
      }

      // Update current user state
      setCurrentUser({
        ...currentUser,
        name: editingProfile.name,
        phone: editingProfile.phone,
        user_type: normalizedUserType
      });
      
      setShowProfileModal(false);
      alert('✅ Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('❌ Failed to update profile. Please try again.');
    }
  };

  const loadAllUsers = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin?action=users`);
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadAllAdmins = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin?action=admins`);
      if (response.ok) {
        const data = await response.json();
        setAllAdmins(data.admins || []);
      }
    } catch (error) {
      console.error('Error loading admins:', error);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    
    if (!newAdminData.name || !newAdminData.email || !newAdminData.password) {
      alert('Please fill in all required fields.');
      return;
    }
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create-admin',
          ...newAdminData
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Admin created successfully!');
          setNewAdminData({
            name: '',
            email: '',
            password: '',
            phone: '',
            userType: 'admin',
            permissions: {
              manage_slips: true,
              manage_bookings: true,
              view_analytics: true,
              manage_users: false,
              manage_admins: false,
              system_settings: false
            }
          });
          loadAllAdmins();
        } else {
          alert(result.error || 'Failed to create admin');
        }
      } else {
        throw new Error('Failed to create admin');
      }
    } catch (error) {
      console.error('Error creating admin:', error);
      alert('❌ Failed to create admin. Please try again.');
    }
  };

  const promotePropertyOwnerToAdmin = async (propertyOwner) => {
    if (!propertyOwner.email) {
      alert('Cannot promote property owner without email address.');
      return;
    }
    
    const confirmPromotion = window.confirm(
      `Promote "${propertyOwner.name}" to admin?\n\n` +
      `Email: ${propertyOwner.email}\n` +
      `Default Password: admin\n\n` +
      `This will create an admin account with basic permissions.`
    );
    
    if (!confirmPromotion) return;
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create-admin',
          name: propertyOwner.name,
          email: propertyOwner.email,
          password: 'admin',
          phone: '',
          userType: 'admin',
          permissions: {
            manage_slips: true,
            manage_bookings: true,
            view_analytics: true,
            manage_users: false,
            manage_admins: false,
            system_settings: false
          }
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(`✅ "${propertyOwner.name}" promoted to admin successfully!\n\n` +
                `Login Credentials:\n` +
                `Email: ${propertyOwner.email}\n` +
                `Password: admin\n\n` +
                `They can now login and manage dock slips and bookings.`);
          loadAllAdmins();
        } else {
          alert(result.error || 'Failed to promote property owner to admin');
        }
      } else {
        throw new Error('Failed to promote property owner to admin');
      }
    } catch (error) {
      console.error('Error promoting property owner to admin:', error);
      alert('❌ Failed to promote property owner to admin. Please try again.');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    
    if (!tempEmail) {
      alert('Please enter your email address.');
      return;
    }
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'forgot-password',
          email: tempEmail
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(`Password reset token generated!\n\nFor testing purposes, your reset token is: ${result.resetToken}\n\nIn production, this would be sent to your email.`);
          setResetToken(result.resetToken);
          setAuthStep('reset-password');
        } else {
          alert(result.error || 'Failed to generate reset token');
        }
      } else {
        throw new Error('Failed to generate reset token');
      }
    } catch (error) {
      console.error('Error generating reset token:', error);
      alert('❌ Failed to generate reset token. Please try again.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!resetToken || !newPassword || !confirmNewPassword) {
      alert('Please fill in all fields.');
      return;
    }
    
    if (newPassword !== confirmNewPassword) {
      alert('New passwords do not match.');
      return;
    }
    
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reset-password',
          resetToken: resetToken,
          newPassword: newPassword
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('✅ Password reset successfully! You can now login with your new password.');
          setAuthStep('login');
          setResetToken('');
          setNewPassword('');
          setConfirmNewPassword('');
          setTempEmail('');
        } else {
          alert(result.error || 'Failed to reset password');
        }
      } else {
        throw new Error('Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('❌ Failed to reset password. Please try again.');
    }
  };



  const resetAuthFlow = () => {
    setAuthStep('login');
    setTempEmail('');
    setLoginData({ email: '', password: '' });
    setRegisterData({ 
      name: '', 
      email: '', 
      password: '', 
      confirmPassword: '',
      phone: '',
      userType: 'renter'
    });
  };

  const sendEmailNotification = async (type, email, data) => {
    try {
      // Use local API endpoint instead of Supabase Edge Function to avoid auth issues
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const fnUrl = `${localApiUrl}/api/send-notification`;
      
      console.log(`📧 Sending ${type} email to ${email}`);
      
      const response = await fetch(fnUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type, email, data }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ ${type} email sent successfully:`, result);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`❌ Failed to send ${type} email:`, errorData);
        // Don't throw - continue with other emails
      }
    } catch (error) {
      console.error(`❌ Error sending ${type} email notification:`, error);
      // Don't fail the booking if email fails
      console.log(`${type} email notification failed, but booking was successful`);
    }
  };

  const sendDockEtiquetteEmail = async (email, slipName, dockEtiquette) => {
    try {
      const fnUrl = `${supabase.functions.url}/send-notification`;
      
      const response = await fetch(fnUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
        },
        body: JSON.stringify({
          type: 'dockEtiquette',
          email,
          data: {
            slipName,
            dockEtiquette
          }
        }),
      });
      
      if (response.ok) {
        console.log('Dock etiquette email sent successfully');
      } else {
        console.error('Failed to send dock etiquette email');
      }
    } catch (error) {
      console.error('Error sending dock etiquette email:', error);
    }
  };

  const handleBoatPictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBookingData(prev => ({
        ...prev,
        boatPicture: file
      }));
    }
  };

  const handleFileUpload = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      setBookingData(prev => ({
        ...prev,
        [field]: file
      }));
    }
  };

  const handleEditEtiquette = (slip) => {
    setEditingSlip({...slip, editingType: 'etiquette'});
    setEditingEtiquette(slip.dockEtiquette || '');
  };

  const handleSaveEtiquette = async () => {
    if (editingSlip && editingEtiquette) {
      try {
        // Save to database
        const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/slips`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update-slip',
            slipId: editingSlip.id,
            slipData: {
              name: editingSlip.name,
              description: editingSlip.description,
              price_per_night: editingSlip.price_per_night,
              dock_etiquette: editingEtiquette,
              images: editingSlip.images
            }
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state
            const updatedSlips = slips.map(slip => 
              slip.id === editingSlip.id 
                ? { ...slip, dockEtiquette: editingEtiquette }
                : slip
            );
            setSlips(updatedSlips);
            setEditingSlip(null);
            setEditingEtiquette('');
            alert('✅ Dock etiquette updated successfully!');
          } else {
            alert('❌ Failed to update dock etiquette: ' + result.error);
          }
        } else {
          throw new Error('Failed to update dock etiquette');
        }
      } catch (error) {
        console.error('Error updating dock etiquette:', error);
        alert('❌ Failed to update dock etiquette. Please try again.');
      }
    }
  };

  // Function to toggle slip availability
  const handleToggleSlipAvailability = async (slip) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/slips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update-slip',
          slipId: slip.id,
          slipData: {
            name: slip.name,
            description: slip.description,
            price_per_night: slip.price_per_night,
            dock_etiquette: slip.dockEtiquette,
            images: slip.images,
            available: !slip.available
          }
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Update local state
          const updatedSlips = slips.map(s => 
            s.id === slip.id 
              ? { ...s, available: !s.available }
              : s
          );
          setSlips(updatedSlips);
          alert(`✅ ${slip.name} ${!slip.available ? 'activated' : 'deactivated'} successfully!`);
        } else {
          alert('❌ Failed to update slip availability: ' + result.error);
        }
      } else {
        throw new Error('Failed to update slip availability');
      }
    } catch (error) {
      console.error('Error updating slip availability:', error);
      alert('❌ Failed to update slip availability. Please try again.');
    }
  };

  // Function to add new slips to database
  const handleAddNewSlips = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/add-new-slips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Reload slips from database
          const slipsResponse = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/slips`);
          if (slipsResponse.ok) {
            const slipsData = await slipsResponse.json();
            setSlips(slipsData.slips || []);
          }
          alert(`✅ ${result.message}`);
        } else {
          alert('❌ Failed to add new slips: ' + result.error);
        }
      } else {
        throw new Error('Failed to add new slips');
      }
    } catch (error) {
      console.error('Error adding new slips:', error);
      alert('❌ Failed to add new slips. Please try again.');
    }
  };

  const handleShowEtiquetteModal = () => {
    setShowEtiquetteModal(true);
  };

  const handleEditUser = (userEmail) => {
    const userBookings = bookings.filter(b => b.guestEmail === userEmail);
    const latestBooking = userBookings[userBookings.length - 1];
    setEditingUser({
      email: userEmail,
      name: latestBooking.guestName,
      phone: latestBooking.guestPhone || '',
      userType: latestBooking.userType
    });
    setShowUserEditModal(true);
  };

  const handleSaveUser = async () => {
    if (editingUser) {
      try {
        // Save to database
        const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update-user',
            userId: editingUser.id,
            userData: {
              name: editingUser.name,
              phone: editingUser.phone,
              userType: editingUser.userType
            }
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state
            const updatedBookings = bookings.map(booking => {
              if (booking.guestEmail === editingUser.email) {
                return {
                  ...booking,
                  guestName: editingUser.name,
                  guestPhone: editingUser.phone,
                  userType: editingUser.userType
                };
              }
              return booking;
            });
            setBookings(updatedBookings);
            setEditingUser(null);
            setShowUserEditModal(false);
            alert('✅ User updated successfully!');
          } else {
            alert('❌ Failed to update user: ' + result.error);
          }
        } else {
          throw new Error('Failed to update user');
        }
      } catch (error) {
        console.error('Error updating user:', error);
        alert('❌ Failed to update user. Please try again.');
      }
    }
  };

  const handleDeleteUser = async (userEmail) => {
    if (window.confirm('Are you sure you want to delete this user? This will also delete all their bookings.')) {
      try {
        // Delete from database
        const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'delete-user',
            userEmail: userEmail
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state
            const updatedBookings = bookings.filter(booking => booking.guestEmail !== userEmail);
            setBookings(updatedBookings);
            alert('✅ User deleted successfully!');
          } else {
            alert('❌ Failed to delete user: ' + result.error);
          }
        } else {
          throw new Error('Failed to delete user');
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('❌ Failed to delete user. Please try again.');
      }
    }
  };

  // Property Owner Edit Functions
  const handleEditPropertyOwnerInfo = (booking) => {
    setEditingBooking({
      ...booking,
      editingType: 'propertyOwnerInfo'
    });
    setEditingPropertyOwnerInfo({
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      boatMakeModel: booking.boatMakeModel,
      boatLength: booking.boatLength
    });
  };

  const handleSavePropertyOwnerInfo = () => {
    if (editingBooking && editingPropertyOwnerInfo) {
      const updatedBookings = bookings.map(booking => 
        booking.id === editingBooking.id 
          ? { 
              ...booking, 
              guestName: editingPropertyOwnerInfo.guestName,
              guestEmail: editingPropertyOwnerInfo.guestEmail,
              guestPhone: editingPropertyOwnerInfo.guestPhone,
              boatMakeModel: editingPropertyOwnerInfo.boatMakeModel,
              boatLength: editingPropertyOwnerInfo.boatLength
            }
          : booking
      );
      setBookings(updatedBookings);
      setEditingBooking(null);
      setEditingPropertyOwnerInfo(null);
    }
  };

  const handleEditPropertyOwnerDates = (booking) => {
    setEditingBooking({
      ...booking,
      editingType: 'propertyOwnerDates'
    });
    setEditingPropertyOwnerDates({
      checkIn: booking.checkIn,
      checkOut: booking.checkOut
    });
  };

  const handleSavePropertyOwnerDates = () => {
    if (editingBooking && editingPropertyOwnerDates) {
      const updatedBookings = bookings.map(booking => 
        booking.id === editingBooking.id 
          ? { 
              ...booking, 
              checkIn: editingPropertyOwnerDates.checkIn,
              checkOut: editingPropertyOwnerDates.checkOut
            }
          : booking
      );
      setBookings(updatedBookings);
      setEditingBooking(null);
      setEditingPropertyOwnerDates(null);
    }
  };

  // First Login Onboarding Functions
  const handleFirstLogin = (user) => {
    // Simple welcome for returning users - no onboarding
    const existingBookings = bookings.filter(booking => 
      (booking.user_id && booking.user_id === user.id) || 
      (!booking.user_id && booking.guestEmail === user.email)
    );
    
    if (existingBookings.length === 0) {
      alert('Welcome back to Dock82! 🚢\n\nReady to book your next dock slip?');
    } else {
      alert(`Welcome back, ${user.name}! 🚢\n\nYou have ${existingBookings.length} booking(s) in your account.`);
    }
  };



  const [editingEtiquette, setEditingEtiquette] = useState('');
  const [showEtiquetteModal, setShowEtiquetteModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showUserEditModal, setShowUserEditModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [editingPropertyOwnerInfo, setEditingPropertyOwnerInfo] = useState(null);
  const [editingPropertyOwnerDates, setEditingPropertyOwnerDates] = useState(null);

  // Load data from API on component mount - only if authenticated
  useEffect(() => {
    // If session is still loading, wait
    if (sessionLoading) {
      return;
    }
    
    // If user is not authenticated, set loading to false and return
    if (!currentUser) {
      setSlipsLoading(false);
      return;
    }
    
    // Clear old localStorage to prevent conflicts
    localStorage.removeItem('dockSlipsData');
    localStorage.removeItem('dockSlipImages');
    
    const loadData = async () => {
      try {
        // Updated $(date) - Force redeploy
        setSlipsLoading(true);
        
        // Load slips from backend API (bypasses RLS)
        let slipsData = null;
        let slipsError = null;
        let transformedSlips = [];
        
        try {
          const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
          const slipsResponse = await fetch(`${localApiUrl}/api/slips`);
          
          if (slipsResponse.ok) {
            const result = await slipsResponse.json();
            slipsData = result.slips || [];
          } else {
            const errorData = await slipsResponse.json();
            slipsError = { message: errorData.error || 'Failed to load slips', code: slipsResponse.status };
          }
        } catch (fetchError) {
          console.error('Error fetching slips from API:', fetchError);
          // Fallback to direct Supabase query
          const { data: directSlipsData, error: directSlipsError } = await supabase
          .from('slips')
          .select('*')
          .order('id');
          
          slipsData = directSlipsData;
          slipsError = directSlipsError;
        }

        if (slipsError) {
          console.error('Error loading slips:', slipsError);
          console.error('Error code:', slipsError.code);
          console.error('Error message:', slipsError.message);
          
          // Check for RLS recursion error
          if (slipsError.code === '42P17' || slipsError.message?.includes('infinite recursion')) {
            console.error('RLS recursion detected - using empty slips array');
            setSlips([]);
            // Don't show alert - just continue with empty array
          } else {
            // Show user-friendly error but continue with empty slips
            console.warn('Could not load slips, continuing with empty array');
            setSlips([]);
          }
              } else {
          transformedSlips = transformSlipsData(slipsData || []);
          setAllSlips(transformedSlips);
          setSlips(transformedSlips);

          if (transformedSlips.length === 0) {
            console.warn('No slips found in database');
          }
        }

        // Load bookings from backend API (bypasses RLS)
        try {
          const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
          const bookingsResponse = await fetch(`${localApiUrl}/api/bookings`);
          
          if (bookingsResponse.ok) {
            const result = await bookingsResponse.json();
            const transformedBookings = transformBookingsData(result.bookings || [], transformedSlips.length ? transformedSlips : slips);
            setAllBookings(transformedBookings);
            setBookings(transformedBookings);
          } else {
            console.error('Error loading bookings from API:', bookingsResponse.status);
            // Fallback to direct Supabase query
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select('*')
          .order('created_at', { ascending: false });

        if (bookingsError) {
          console.error('Error loading bookings from Supabase:', bookingsError);
              // Check for RLS recursion
              if (bookingsError.code === '42P17' || bookingsError.message?.includes('infinite recursion')) {
                console.warn('RLS recursion in bookings, continuing with empty array');
                setBookings([]);
        } else {
                setBookings([]);
              }
        } else {
          const transformedBookings = transformBookingsData(bookingsData || [], transformedSlips.length ? transformedSlips : slips);
          setAllBookings(transformedBookings);
          setBookings(transformedBookings);
            }
          }
        } catch (fetchError) {
          console.error('Error fetching bookings from API:', fetchError);
          // Continue with empty bookings array
          setBookings([]);
        }
      } catch (error) {
        console.error('Error loading data from Supabase:', error);
        console.error('Error details:', error.message, error.code);
        // Set empty slips array to prevent app from breaking
        setSlips([]);
        // Don't show alert - just log the error
      } finally {
        setSlipsLoading(false);
      }
    };
    
    // Only load data if user is authenticated
    if (currentUser) {
    loadData();
    } else {
      setSlipsLoading(false);
    }
  }, [currentUser, sessionLoading]);


  useEffect(() => {
    if (sessionLoading || !currentUser) return;

    if (currentView && currentView !== 'browse' && currentView !== null) {
      return;
    }

    const start = searchFilters.dateRangeStart;
    const end = searchFilters.dateRangeEnd;

    if (!start || !end) {
      if (allSlips.length) {
        setSlips(allSlips);
      }
      if (allBookings.length) {
        setBookings(allBookings);
      }
      setSlipsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAvailableSlips = async () => {
      setSlipsLoading(true);
      try {
        const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
        const params = new URLSearchParams({ start, end });
        const response = await fetch(`${localApiUrl}/api/slips?${params.toString()}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch available slips');
        }

        const result = await response.json();
        if (cancelled) return;

        const availableSlips = transformSlipsData(result.slips || []);
        setSlips(availableSlips);

        if (result.bookings) {
          const transformed = transformBookingsData(result.bookings, availableSlips);
          setBookings(transformed);
        } else {
          setBookings(allBookings.length ? allBookings : bookings);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching available slips:', error);
          setSlips(allSlips.length ? allSlips : slips);
          setBookings(allBookings.length ? allBookings : bookings);
        }
      } finally {
        if (!cancelled) {
          setSlipsLoading(false);
        }
      }
    };

    fetchAvailableSlips();

    return () => {
      cancelled = true;
    };
  }, [searchFilters.dateRangeStart, searchFilters.dateRangeEnd, currentUser, sessionLoading, currentView, allSlips, allBookings]);




  // Show loading screen while checking session
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your session...</p>
        </div>
      </div>
    );
  }

  // Show loading screen while loading slips data
  if (slipsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dock slips...</p>
        </div>
      </div>
    );
  }


  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 text-blue-600 mr-3 text-2xl">🌊🐢</div>
              <h1 className="text-2xl font-bold text-gray-900">Jose's Hideaway Dock Association - DOCK 82</h1>
            </div>
            <nav className="flex items-center space-x-6">
              <button
                onClick={() => {
                  if (!currentUser) {
                    setShowLoginModal(true);
                    resetAuthFlow();
                  } else {
                    setCurrentView('browse');
                  }
                }}
                className={`px-3 py-2 rounded-md ${currentView === 'browse' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Browse Slips
              </button>
              {currentUser && (
                <button
                  onClick={() => setCurrentView('bookings')}
                  className={`px-3 py-2 rounded-md ${currentView === 'bookings' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  My Bookings
                </button>
              )}
              <button
                onClick={() => setCurrentView('notifications')}
                className={`px-3 py-2 rounded-md ${currentView === 'notifications' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
              >
                📧 Notifications {notifications.length > 0 && (
                  <span className="bg-red-500 text-white rounded-full px-2 py-1 text-xs ml-1">
                    {notifications.length}
                  </span>
                )}
              </button>
              {adminMode && (
                <button
                  onClick={() => setCurrentView('admin')}
                  className={`px-3 py-2 rounded-md ${currentView === 'admin' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <Settings className="w-4 h-4 inline mr-1" />
                  Admin Panel
                </button>
              )}
              
              {/* User Authentication */}
              {currentUser ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-700">Welcome, {currentUser.name}</span>
                  <button
                    onClick={handleEditProfile}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                  >
                    <User className="w-4 h-4 inline mr-1" />
                    Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setShowLoginModal(true);
                      resetAuthFlow();
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                  >
                    Sign In
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {showPaymentPage ? (
          <PaymentPage
            bookingData={bookingData}
            selectedSlip={selectedSlip}
            onPaymentComplete={handlePaymentComplete}
            onBack={() => setShowPaymentPage(false)}
          />
        ) : (
          <>
            {(currentView === 'browse' || (currentView === null && currentUser)) && (
              <>
            {/* Require authentication to browse slips */}
            {!currentUser ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <div className="max-w-md mx-auto">
                  <Lock className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign In Required</h2>
                  <p className="text-gray-600 mb-6">
                    Please sign in to browse and book available dock slips.
                  </p>
                  <button
                    onClick={() => {
                      setShowLoginModal(true);
                      resetAuthFlow();
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            ) : (
              <>
            {/* Search and Filters */}
            <div className="mb-8 bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Select an Available Slip</h2>
              
              {/* Date Range Filter */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Date Range (Optional)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Check-In Date</label>
                    <input
                      type="date"
                      value={searchFilters.dateRangeStart}
                      onChange={(e) => setSearchFilters({...searchFilters, dateRangeStart: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Check-Out Date</label>
                    <input
                      type="date"
                      value={searchFilters.dateRangeEnd}
                      onChange={(e) => setSearchFilters({...searchFilters, dateRangeEnd: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min={searchFilters.dateRangeStart || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                {(searchFilters.dateRangeStart || searchFilters.dateRangeEnd) && (
                  <button
                    onClick={() => setSearchFilters({...searchFilters, dateRangeStart: '', dateRangeEnd: ''})}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    Clear date filter
                  </button>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  Only slips available for the selected dates will be shown
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Self Check-In:</strong> Once your booking is confirmed, you'll receive a dock permit via email. 
                  Simply print it and display on your boat dashboard upon arrival.
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Where Your Payment Goes:</strong> All dock proceeds support annual maintenance and month-to-month operational costs 
                  of Jose's Hideaway Dock Association - DOCK 82. Homeowners enjoy complimentary access as part of their dock association benefits.
                </p>
              </div>
            </div>

            {/* Slips Grid */}
            {filteredSlips.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-600">No slips available at this time. Please check back later.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSlips.map(slip => (
                <SlipCard key={slip.id} slip={slip} />
              ))}
            </div>
            )}
              </>
            )}
              </>
            )}

            {currentView === 'booking' && selectedSlip && !showPaymentPage && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Book {selectedSlip.name}</h2>
              <button
                onClick={() => {
                  setCurrentView('browse');
                  setSelectedSlip(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleBookingSubmit} className="space-y-6">
              {/* User Type Display */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Booking Type</h3>
                <p className="text-sm text-gray-600">
                  {bookingData.userType === 'homeowner'
                    ? 'Homeowner booking (no nightly charge)'
                    : 'Renter booking (charged per night)'}
                </p>
              </div>

              {/* Booking Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Check-in Date</label>
                  <input
                    type="date"
                    value={bookingData.checkIn}
                    onChange={(e) => setBookingData({...bookingData, checkIn: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Check-out Date</label>
                  <input
                    type="date"
                    value={bookingData.checkOut}
                    onChange={(e) => setBookingData({...bookingData, checkOut: e.target.value})}
                    min={bookingData.checkIn || new Date().toISOString().split('T')[0]}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  {currentUser && currentUser.user_type === 'renter' && (
                    <p className="text-sm text-blue-600 mt-1">
                      ⏰ Renters can book up to 30 days. Book exactly 30 days for a 40% discount!
                    </p>
                  )}
                </div>
              </div>

              {/* Boat Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Boat Length (ft)</label>
                  <input
                    type="number"
                    value={bookingData.boatLength}
                    onChange={(e) => setBookingData({...bookingData, boatLength: e.target.value})}
                    min="1"
                    max={selectedSlip.max_length}
                    step="0.1"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  {bookingData.boatLength && selectedSlip.max_length && parseInt(bookingData.boatLength) > selectedSlip.max_length && (
                    <p className="text-red-600 text-sm mt-1">Boat length exceeds maximum allowed ({selectedSlip.max_length}ft)</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Boat Make & Model</label>
                  <input
                    type="text"
                    value={bookingData.boatMakeModel}
                    onChange={(e) => setBookingData({...bookingData, boatMakeModel: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              {/* Boat Picture Upload */}
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center">
                  📸 Boat Picture
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Upload a picture of your boat to help with identification and marina management. This is optional but recommended.
                </p>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBoatPictureChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {bookingData.boatPicture && (
                    <div className="mt-2">
                      <p className="text-sm text-green-600 mb-2">✓ Boat picture uploaded: {bookingData.boatPicture.name}</p>
                      <img 
                        src={URL.createObjectURL(bookingData.boatPicture)} 
                        alt="Boat preview"
                        className="w-full max-w-xs h-32 object-cover rounded border"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Guest Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Guest Name</label>
                  <input
                    type="text"
                    value={bookingData.guestName}
                    onChange={(e) => setBookingData({...bookingData, guestName: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    readOnly={!!currentUser}
                    disabled={!!currentUser}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={bookingData.guestEmail}
                    onChange={(e) => setBookingData({...bookingData, guestEmail: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    readOnly={!!currentUser}
                    disabled={!!currentUser}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                <input
                  type="tel"
                  value={bookingData.guestPhone}
                  onChange={(e) => setBookingData({...bookingData, guestPhone: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Payment Section for Renters */}
              {bookingData.userType === 'renter' && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Payment Information
                  </h3>
                  
                  {/* Payment Method */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                    <div className="flex items-center">
                      <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
                      <span className="text-gray-700">Credit Card (Stripe)</span>
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-white p-4 rounded border">
                    <h4 className="font-medium mb-2">Payment Summary</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Slip Rate:</span>
                        <span>${selectedSlip.price_per_night || 0}/night</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Nights:</span>
                        <span>{bookingData.checkIn && bookingData.checkOut ? 
                          Math.ceil((new Date(bookingData.checkOut) - new Date(bookingData.checkIn)) / (1000 * 60 * 60 * 24)) : 0}
                        </span>
                      </div>
                      {(() => {
                        const totalInfo = calculateBookingTotal(bookingData.checkIn, bookingData.checkOut, selectedSlip.price_per_night);
                        return (
                          <>
                            {totalInfo.hasDiscount && (
                              <>
                                <div className="flex justify-between text-green-600">
                                  <span>Base Total:</span>
                                  <span>${(totalInfo.baseTotal || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-green-600">
                                  <span>30-Day Discount (40%):</span>
                                  <span>-${(totalInfo.discount || 0).toFixed(2)}</span>
                                </div>
                              </>
                            )}
                            <div className="border-t pt-1 font-medium">
                              <div className="flex justify-between">
                                <span>Total:</span>
                                <span className={totalInfo.hasDiscount ? 'text-green-600' : ''}>
                                  ${(totalInfo.finalTotal || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                </div>
              )}

              {/* Document Upload Section */}
              {bookingData.userType === 'renter' && (
                <div className="bg-red-100 p-4 rounded-lg border-2 border-red-300">
                  <h3 className="text-lg font-semibold text-red-900 mb-3">🚨 REQUIRED DOCUMENTS</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">📋 Rental Agreement</label>
                      <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setBookingData({...bookingData, rentalAgreement: e.target.files[0]})} className="w-full border-2 border-blue-500 rounded-md px-3 py-3 bg-blue-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">🛡️ Boat Insurance Proof</label>
                      <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setBookingData({...bookingData, insuranceProof: e.target.files[0]})} className="w-full border-2 border-blue-500 rounded-md px-3 py-3 bg-blue-50" />
                    </div>
                  </div>
                </div>
              )}
              {bookingData.userType === 'homeowner' && (
                <div className="bg-red-100 p-4 rounded-lg border-2 border-red-300">
                  <h3 className="text-lg font-semibold text-red-900 mb-3">🚨 REQUIRED DOCUMENTS</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">📋 Homeowner Authorization Letter</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => setBookingData({...bookingData, homeownerAuthorizationLetter: e.target.files[0]})}
                        className="w-full border-2 border-blue-500 rounded-md px-3 py-3 bg-blue-50"
                        required
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Please upload your homeowner authorization letter confirming your slip usage.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">🛡️ Proof of Home Insurance (Optional)</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.png"
                        onChange={(e) => setBookingData({...bookingData, homeownerInsuranceProof: e.target.files[0]})}
                        className="w-full border-2 border-blue-500 rounded-md px-3 py-3 bg-blue-50"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Optionally upload proof of insurance for additional verification.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* Dock Etiquette Display */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center">
                  📋 Dock Etiquette Rules
                </h3>
                <div className="text-sm text-gray-700 mb-3">
                  <p>Please review the dock etiquette rules for {selectedSlip.name}:</p>
                  <div className="bg-white p-3 rounded border mt-2 whitespace-pre-line text-gray-800">
                    {selectedSlip.dockEtiquette || 
                      "• Respect quiet hours (10 PM - 7 AM)\n• Keep slip area clean and organized\n• Follow all safety protocols\n• Notify management of any issues\n• No loud music or parties\n• Proper waste disposal required"
                    }
                  </div>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={bookingData.agreedToTerms}
                    onChange={(e) => setBookingData({...bookingData, agreedToTerms: e.target.checked})}
                    className="mr-2"
                    required
                  />
                  <span className="text-sm">I have read and agree to the dock etiquette rules</span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('browse');
                    setSelectedSlip(null);
                  }}
                  className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentProcessing}
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {paymentProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing Payment...
                    </>
                  ) : (
                    <>
                      {bookingData.userType === 'renter' ? 'Pay & Book Slip' : 'Confirm Booking'}
                    </>
                  )}
                </button>
              </div>

              {/* Payment Error Display */}
              {paymentError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-800">{paymentError}</p>
                </div>
              )}
            </form>
          </div>
        )}
        {currentView === 'bookings' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-6">My Bookings</h2>
            
            {currentUser ? (
              userBookings.length > 0 ? (
                <div className="space-y-4">
                  {userBookings.map(booking => (
                    <div key={booking.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-lg">{booking.slipName || `Slip ${booking.slipId?.substring(0, 8) || 'Unknown'}`}</h3>
                          <p className="text-gray-600">
                            {booking.checkIn ? new Date(booking.checkIn).toLocaleDateString() : 'N/A'} - {booking.checkOut ? new Date(booking.checkOut).toLocaleDateString() : 'N/A'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Boat: {booking.boatMakeModel || 'N/A'} {booking.boatLength ? `(${booking.boatLength}ft)` : ''}
                          </p>
                          <p className="text-sm text-gray-500">Type: {booking.userType === 'homeowner' ? 'Property Owner' : booking.userType || 'Renter'}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                            booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {booking.status}
                          </span>
                          {booking.status === 'confirmed' && (
                            <button
                              onClick={() => {
                                downloadPermitPDF(booking);
                              }}
                              className="block mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              📄 Download Permit
                            </button>
                          )}
                          
                          {/* Property Owner Edit Buttons */}
                          {booking.userType === 'homeowner' && (
                            <div className="mt-2 space-y-1">
                              <button
                                onClick={() => handleEditPropertyOwnerInfo(booking)}
                                className="block text-green-600 hover:text-green-700 text-xs"
                              >
                                Edit Info
                              </button>
                              <button
                                onClick={() => handleEditPropertyOwnerDates(booking)}
                                className="block text-purple-600 hover:text-purple-700 text-xs"
                              >
                                Edit Dates
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Property Owner Edit Forms */}
                      {editingBooking?.id === booking.id && editingBooking.editingType === 'propertyOwnerInfo' && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                          <h4 className="font-medium mb-3">Edit Property Owner Information</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                              <input
                                type="text"
                                value={editingPropertyOwnerInfo?.guestName || ''}
                                onChange={(e) => setEditingPropertyOwnerInfo({...editingPropertyOwnerInfo, guestName: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                              <input
                                type="email"
                                value={editingPropertyOwnerInfo?.guestEmail || ''}
                                onChange={(e) => setEditingPropertyOwnerInfo({...editingPropertyOwnerInfo, guestEmail: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                              <input
                                type="tel"
                                value={editingPropertyOwnerInfo?.guestPhone || ''}
                                onChange={(e) => setEditingPropertyOwnerInfo({...editingPropertyOwnerInfo, guestPhone: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Boat Make & Model</label>
                              <input
                                type="text"
                                value={editingPropertyOwnerInfo?.boatMakeModel || ''}
                                onChange={(e) => setEditingPropertyOwnerInfo({...editingPropertyOwnerInfo, boatMakeModel: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Boat Length (ft)</label>
                              <input
                                type="number"
                                value={editingPropertyOwnerInfo?.boatLength || ''}
                                onChange={(e) => setEditingPropertyOwnerInfo({...editingPropertyOwnerInfo, boatLength: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex space-x-2 mt-4">
                            <button
                              onClick={handleSavePropertyOwnerInfo}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={() => {
                                setEditingBooking(null);
                                setEditingPropertyOwnerInfo(null);
                              }}
                              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {editingBooking?.id === booking.id && editingBooking.editingType === 'propertyOwnerDates' && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                          <h4 className="font-medium mb-3">Edit Property Owner Dates</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date</label>
                              <input
                                type="date"
                                value={editingPropertyOwnerDates?.checkIn || ''}
                                onChange={(e) => setEditingPropertyOwnerDates({...editingPropertyOwnerDates, checkIn: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Date</label>
                              <input
                                type="date"
                                value={editingPropertyOwnerDates?.checkOut || ''}
                                onChange={(e) => setEditingPropertyOwnerDates({...editingPropertyOwnerDates, checkOut: e.target.value})}
                                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex space-x-2 mt-4">
                            <button
                              onClick={handleSavePropertyOwnerDates}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={() => {
                                setEditingBooking(null);
                                setEditingPropertyOwnerDates(null);
                              }}
                              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No bookings found. Start by browsing available slips!</p>
                  <button
                    onClick={() => setCurrentView('browse')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Browse Slips
                  </button>
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Please login to view your bookings.</p>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Login
                </button>
              </div>
            )}
          </div>
        )}
        {currentView === 'notifications' && <div>Notifications Coming Soon...</div>}
        {currentView === 'admin' && adminMode && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-6">Admin Panel</h2>
            
            {/* Admin Navigation */}
            <div className="flex space-x-4 mb-6 border-b">
              <button
                onClick={() => setAdminView('overview')}
                className={`px-4 py-2 font-medium ${adminView === 'overview' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Overview
              </button>
              <button
                onClick={() => setAdminView('bookings')}
                className={`px-4 py-2 font-medium ${adminView === 'bookings' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Bookings
              </button>
              <button
                onClick={() => setAdminView('financials')}
                className={`px-4 py-2 font-medium ${adminView === 'financials' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Financials
              </button>
              <button
                onClick={() => setAdminView('settings')}
                className={`px-4 py-2 font-medium ${adminView === 'settings' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Settings
              </button>
              <button
                onClick={() => setAdminView('users')}
                className={`px-4 py-2 font-medium ${adminView === 'users' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Users
              </button>

            </div>

            {/* Overview Tab */}
            {adminView === 'overview' && (
              <>
                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-800">Total Slips</h4>
                    <p className="text-2xl font-bold text-blue-600">{slips.length}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-800">Available</h4>
                    <p className="text-2xl font-bold text-green-600">{slips.filter(s => s.available).length}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-800">Occupied</h4>
                    <p className="text-2xl font-bold text-red-600">{slips.filter(s => !s.available).length}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-800">Total Revenue</h4>
                    <p className="text-2xl font-bold text-purple-600">${(calculateRevenue() || 0).toFixed(2)}</p>
                  </div>
                </div>

                {/* Recent Bookings */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recent Bookings</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Slip</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Guest</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Dates</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.slice(0, 5).map(booking => (
                          <tr key={booking.id} className="border-t">
                            <td className="px-4 py-2 text-sm">{booking.slipName}</td>
                            <td className="px-4 py-2 text-sm">{booking.guestName}</td>
                            <td className="px-4 py-2 text-sm">{booking.checkIn} - {booking.checkOut}</td>
                            <td className="px-4 py-2 text-sm">
                              <span className={`px-2 py-1 rounded text-xs ${
                                booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {booking.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <span className={`px-2 py-1 rounded text-xs ${
                                booking.userType === 'homeowner' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {booking.userType}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Bookings Management Tab */}
            {adminView === 'bookings' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Booking Management</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">ID</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Slip</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Guest</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Boat</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Contact</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Dates</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Documents</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map(booking => (
                        <tr key={booking.id} className="border-t">
                          <td className="px-4 py-2 text-sm">#{booking.id}</td>
                          <td className="px-4 py-2 text-sm">{booking.slipName}</td>
                          <td className="px-4 py-2 text-sm">{booking.guestName}</td>
                          <td className="px-4 py-2 text-sm">
                            <div className="text-xs">
                              <div>{booking.boatMakeModel}</div>
                              <div>{booking.boatLength}ft</div>
                              {(booking.boatPicture || booking.boatPicturePath) && (
                                <div className="mt-1">
                                  <span className="text-green-600">📸 Picture uploaded</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <div className="text-xs">
                              <div>{booking.guestEmail}</div>
                              <div>{booking.guestPhone}</div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm">{booking.checkIn} - {booking.checkOut}</td>
                          <td className="px-4 py-2 text-sm">
                            <div className="flex flex-col space-y-1">
                              {booking.rentalAgreementPath ? (
                                <button
                                  onClick={() => handleViewDocument(booking, 'rental_agreement')}
                                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Rental Agreement
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">No Agreement</span>
                              )}
                              {booking.insuranceProofPath ? (
                                <button
                                  onClick={() => handleViewDocument(booking, 'insurance')}
                                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Insurance Proof
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">No Insurance</span>
                              )}
                              {booking.boatPicturePath ? (
                                <button
                                  onClick={() => handleViewDocument(booking, 'boat_picture')}
                                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Boat Picture
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">No Boat Photo</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {booking.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {booking.status === 'pending' && (
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => handleApproveBooking(booking.id)}
                                  className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleCancelBooking(booking.id)}
                                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Financials Tab */}
            {adminView === 'financials' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Financial Reports</h3>
                
                {/* Revenue Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-800">Total Revenue</h4>
                    <p className="text-2xl font-bold text-green-600">${(calculateRevenue() || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-800">This Month</h4>
                    <p className="text-2xl font-bold text-blue-600">${(getMonthlyRevenue() || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-800">Total Bookings</h4>
                    <p className="text-2xl font-bold text-purple-600">{bookings.filter(b => b.status === 'confirmed' && b.userType === 'renter').length}</p>
                  </div>
                </div>

                {/* Revenue Breakdown */}
                <div className="bg-white border rounded-lg p-4">
                  <h4 className="font-semibold mb-4">Revenue by Slip</h4>
                  <div className="space-y-2">
                    {slips.map(slip => {
                      const slipBookings = bookings.filter(b => 
                        b.slipName === slip.name && 
                        b.status === 'confirmed' && 
                        b.userType === 'renter'
                      );
                      const slipRevenue = slipBookings.reduce((total, booking) => {
                        const nights = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
                        return total + (nights * slip.price_per_night);
                      }, 0);
                      
                      return (
                        <div key={slip.id} className="flex justify-between items-center py-2 border-b">
                          <span className="font-medium">{slip.name}</span>
                          <span className="text-green-600">${(slipRevenue || 0).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {adminView === 'settings' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Slip Management</h3>
                
                {/* New Slips Management */}
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-blue-800 mb-2">Add New Slips</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    Add Slips 13 and 14 to the database. These slips will be initially deactivated and can be activated from the admin panel.
                  </p>
                  <button
                    onClick={handleAddNewSlips}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Add Slips 13 & 14 to Database
                  </button>
                </div>

                {/* Slip Availability Management */}
                <div className="bg-green-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-green-800 mb-2">Slip Availability Control</h4>
                  <p className="text-sm text-green-700 mb-3">
                    Activate or deactivate slips. Deactivated slips will not appear in the booking interface.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {slips.filter(slip => slip.name.includes('Slip 13') || slip.name.includes('Slip 14')).map(slip => (
                      <div key={slip.id} className="bg-white p-3 rounded border">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{slip.name}</span>
                          <span className={`px-2 py-1 rounded text-xs ${slip.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {slip.available ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleSlipAvailability(slip)}
                          className={`w-full px-3 py-1 rounded text-sm font-medium transition-colors ${
                            slip.available 
                              ? 'bg-red-600 text-white hover:bg-red-700' 
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {slip.available ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Slip Descriptions and Pricing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {slips.map(slip => (
                    <div key={slip.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">{slip.name}</h4>
                        <span className={`px-2 py-1 rounded text-xs ${slip.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {slip.available ? 'Available' : 'Occupied'}
                        </span>
                      </div>
                      
                      {/* Description Editing */}
                      {editingSlip?.id === slip.id && editingSlip.editingType === 'description' ? (
                        <div className="space-y-2 mb-3">
                          <label className="block text-sm font-medium text-gray-700">Description</label>
                          <textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            placeholder="Enter slip description..."
                            className="w-full p-2 border rounded text-sm"
                            rows="3"
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={handleSaveDescription}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3">
                          <p className="text-sm text-gray-600 mb-2">
                            {slip.description || 'No description set'}
                          </p>
                          <button
                            onClick={() => {
                              setEditingSlip({...slip, editingType: 'description'});
                              setEditingDescription(slip.description || '');
                            }}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Edit Description
                          </button>
                        </div>
                      )}

                      {/* Price Editing */}
                      {editingSlip?.id === slip.id && editingSlip.editingType === 'price' ? (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">Price per Night</label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">$</span>
                            <input
                              type="number"
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(e.target.value)}
                              className="w-20 p-1 border rounded text-sm"
                              min="0"
                              step="0.01"
                            />
                            <button
                              onClick={handleSavePrice}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">
                            Current Price: <span className="font-medium">${slip.price_per_night}/night</span>
                          </p>
                          <button
                            onClick={() => {
                              setEditingSlip({...slip, editingType: 'price'});
                              setEditingPrice(slip.price_per_night.toString());
                            }}
                            className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                          >
                            Edit Price
                          </button>
                        </div>
                      )}

                      {/* Image Display */}
                      {(() => {
                        let imageSrc = null;
                        if (slip.images && Array.isArray(slip.images) && slip.images.length > 0) {
                          imageSrc = slip.images[0];
                        } else if (slip.images && typeof slip.images === 'string' && slip.images.startsWith('data:image/')) {
                          imageSrc = slip.images;
                        }
                        
                        return imageSrc ? (
                          <div className="mt-3">
                            <div className="mb-2">
                              <img 
                                src={imageSrc} 
                                alt={slip.name}
                                className="w-full h-24 object-cover rounded border"
                              />
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                </div>

                {/* Bulk Image Management */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Bulk Image Management</h3>
                  
                  <div className="bg-yellow-50 p-4 rounded-lg mb-6">
                    <h4 className="font-semibold text-yellow-800 mb-2">Quick Image Actions</h4>
                    <p className="text-sm text-yellow-700">
                      Use these buttons to quickly update all dock slip images at once. 
                      Individual slip images can still be edited above.
                    </p>
                  </div>

                </div>

                {/* Dock Etiquette Management */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Dock Etiquette Management</h3>
                  
                  <div className="bg-blue-50 p-4 rounded-lg mb-6">
                    <h4 className="font-semibold text-blue-800 mb-2">About Dock Etiquette</h4>
                    <p className="text-sm text-blue-700">
                      Set and manage dock etiquette rules for each slip. These rules help ensure proper marina behavior 
                      and create a respectful environment for all users. Users will see these rules during booking.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {slips.map(slip => (
                      <div key={slip.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-medium">{slip.name}</h4>
                          <span className={`px-2 py-1 rounded text-xs ${slip.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {slip.available ? 'Available' : 'Occupied'}
                          </span>
                        </div>
                        
                        {/* Etiquette Editing */}
                        {editingSlip?.id === slip.id && editingSlip.editingType === 'etiquette' ? (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">Dock Etiquette Rules</label>
                            <textarea
                              value={editingEtiquette}
                              onChange={(e) => setEditingEtiquette(e.target.value)}
                              placeholder="Enter dock etiquette rules..."
                              className="w-full p-2 border rounded text-sm"
                              rows="6"
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={handleSaveEtiquette}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                              >
                                Save Rules
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="mb-3">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Current Rules:</h5>
                              <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 whitespace-pre-line">
                                {slip.dockEtiquette || 'No etiquette rules set for this slip.'}
                              </div>
                            </div>
                            <button
                              onClick={() => handleEditEtiquette(slip)}
                              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                            >
                              Edit Etiquette
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Quick Etiquette Templates */}
                  <div className="mt-6 bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-3">Quick Etiquette Templates</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-3 rounded border">
                        <h5 className="font-medium text-sm mb-2">Standard Rules</h5>
                        <button
                          onClick={() => {
                            const standardRules = "• Respect quiet hours (10 PM - 7 AM)\n• Keep slip area clean and organized\n• Follow all safety protocols\n• Notify management of any issues\n• No loud music or parties\n• Proper waste disposal required";
                            setEditingEtiquette(standardRules);
                          }}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                        >
                          Use Standard Rules
                        </button>
                      </div>
                      <div className="bg-white p-3 rounded border">
                        <h5 className="font-medium text-sm mb-2">Family-Friendly Rules</h5>
                        <button
                          onClick={() => {
                            const familyRules = "• Family-friendly environment\n• Respect quiet hours (9 PM - 8 AM)\n• Supervise children at all times\n• Keep slip area clean and organized\n• Follow all safety protocols\n• No pets without permission\n• Proper waste disposal required";
                            setEditingEtiquette(familyRules);
                          }}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                        >
                          Use Family Rules
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {adminView === 'users' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">User Management</h3>
                
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-blue-800 mb-2">User Information</h4>
                  <p className="text-sm text-blue-700">
                    View and manage all registered users including property owners and renters. 
                    Contact information and booking history are available for each user.
                  </p>
                </div>

                {/* Property Owners Section */}
                <div className="mb-8">
                  <h4 className="text-lg font-semibold mb-4 flex items-center">
                    🏠 Property Owners ({propertyOwners.length})
                    {superAdminMode && (
                      <span className="ml-2 text-sm text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                        👑 Superadmin Access
                      </span>
                    )}
                  </h4>
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcel</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {propertyOwners.map((owner, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {owner.name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {owner.address}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {owner.parcel || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {owner.email ? (
                                  <a href={`mailto:${owner.email}`} className="text-blue-600 hover:text-blue-800">
                                    {owner.email}
                                  </a>
                                ) : (
                                  'No email'
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                  Active Owner
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {superAdminMode && owner.email ? (
                                  <button
                                    onClick={() => promotePropertyOwnerToAdmin(owner)}
                                    className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    title="Promote to Admin (Superadmin Only)"
                                  >
                                    👑 Make Admin
                                  </button>
                                ) : owner.email ? (
                                  <span className="text-gray-400 text-xs">Contact superadmin</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">No email</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Registered Users Section */}
                <div className="mb-8">
                  <h4 className="text-lg font-semibold mb-4 flex items-center">
                    👥 Registered Users ({Array.from(new Set(bookings.map(b => b.guestEmail))).length})
                  </h4>
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bookings</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {Array.from(new Set(bookings.map(b => b.guestEmail))).map(email => {
                            const userBookings = bookings.filter(b => b.guestEmail === email);
                            const latestBooking = userBookings[userBookings.length - 1];
                            const userType = latestBooking.userType;
                            const totalBookings = userBookings.length;
                            const confirmedBookings = userBookings.filter(b => b.status === 'confirmed').length;
                            
                            return (
                              <tr key={email} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {latestBooking.guestName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  <a href={`mailto:${email}`} className="text-blue-600 hover:text-blue-800">
                                    {email}
                                  </a>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {latestBooking.guestPhone || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    userType === 'homeowner' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {userType === 'homeowner' ? 'Homeowner' : 'Renter'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {totalBookings} total ({confirmedBookings} confirmed)
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    confirmedBookings > 0 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {confirmedBookings > 0 ? 'Active' : 'Pending'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => handleEditUser(email)}
                                      className="text-blue-600 hover:text-blue-900 text-xs bg-blue-50 px-2 py-1 rounded"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteUser(email)}
                                      className="text-red-600 hover:text-red-900 text-xs bg-red-50 px-2 py-1 rounded"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* User Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">🏠</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Total Owners</p>
                        <p className="text-lg font-semibold text-gray-900">{propertyOwners.length}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">👥</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Registered Users</p>
                        <p className="text-lg font-semibold text-gray-900">{Array.from(new Set(bookings.map(b => b.guestEmail))).length}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">📋</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Total Bookings</p>
                        <p className="text-lg font-semibold text-gray-900">{bookings.length}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">✅</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500">Confirmed Bookings</p>
                        <p className="text-lg font-semibold text-gray-900">{bookings.filter(b => b.status === 'confirmed').length}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}
          </>
        )}
      </main>

      {/* Simplified Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {authStep === 'login' ? 'Sign In' : 
                 authStep === 'register' ? 'Create Account' : 
                 authStep === 'verify-contact' ? 'Review Information' : 
                 authStep === 'forgot-password' ? 'Reset Password' :
                 authStep === 'reset-password' ? 'Set New Password' :
                 'Authentication'}
              </h2>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  resetAuthFlow();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Login Form - Email and Password Together */}
            {authStep === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600">Sign in to your account</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={loginData.email}
                    onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="your@email.com"
                    autoComplete="username"
                    name="email"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    name="password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  Sign In
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setTempEmail(loginData.email);
                      setAuthStep('forgot-password');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 block"
                  >
                    Forgot your password?
                    </button>
                </div>
              </form>
            )}

            {/* Forgot Password Step */}
            {authStep === 'forgot-password' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600">Reset your password</p>
                  <button
                    type="button"
                    onClick={() => {
                      setTempEmail('');
                      setAuthStep('login');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Back to login
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={tempEmail}
                    onChange={(e) => setTempEmail(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="your@email.com"
                    autoComplete="username"
                    name="email"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  Send Reset Link
                </button>
              </form>
            )}

            {/* Reset Password Step */}
            {authStep === 'reset-password' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600">Enter your new password</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthStep('forgot-password');
                      setResetToken('');
                      setNewPassword('');
                      setConfirmNewPassword('');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Back to forgot password
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reset Token</label>
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter the reset token from your email"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter new password"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Confirm new password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  Reset Password
                </button>
              </form>
            )}

            {/* Resend Verification Step */}
            {authStep === 'resend-verification' && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600">Email verification required</p>
                  <p className="text-sm text-gray-500 mt-2">
                    We sent a verification link to <strong>{loginData.email}</strong>
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <p className="text-sm text-blue-800">
                    📧 Please check your email and click the verification link to activate your account.
                  </p>
                  <p className="text-sm text-blue-700 mt-2">
                    If you don't see the email, check your spam folder.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep('login');
                    setLoginData({ email: '', password: '' });
                  }}
                  className="w-full bg-gray-200 text-gray-700 py-3 rounded-md hover:bg-gray-300 font-medium"
                >
                  Back to Login
                </button>
              </div>
            )}
            
            {/* Step 3: Registration */}
            {authStep === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600">Create your account</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRegisterData({ ...registerData, email: '' });
                      setTempEmail('');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Use different email
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={registerData.name}
                    onChange={(e) => setRegisterData({...registerData, name: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your full name"
                    autoComplete="name"
                    name="name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={registerData.email}
                    onChange={(e) => {
                      console.log('Email input changed:', e.target.value);
                      setRegisterData({...registerData, email: e.target.value});
                    }}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoComplete="username"
                    name="email"
                    required
                    placeholder="Enter your email address"
                  />
                  <p className="text-xs text-gray-500 mt-1">Current value: {registerData.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone (Optional)</label>
                  <input
                    type="tel"
                    value={registerData.phone}
                    onChange={(e) => setRegisterData({...registerData, phone: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                  <select
                    value={registerData.userType}
                    onChange={(e) => setRegisterData({...registerData, userType: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="renter">Renter</option>
                    <option value="homeowner">Homeowner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Create Password</label>
                  <input
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    name="new-password"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={registerData.confirmPassword}
                    onChange={(e) => setRegisterData({...registerData, confirmPassword: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    name="confirm-password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  Continue to Review
                </button>
              </form>
            )}

            {/* Step 4: Contact Info Verification */}
            {authStep === 'verify-contact' && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Review Your Information</h3>
                  <p className="text-gray-600">Please verify your contact details before creating your account</p>
                </div>
                
                {/* Contact Info Summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Full Name:</span>
                    <span className="text-sm text-gray-900">{registerData.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Email:</span>
                    <span className="text-sm text-gray-900">{registerData.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Phone:</span>
                    <span className="text-sm text-gray-900">{registerData.phone || 'Not provided'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">User Type:</span>
                    <span className="text-sm text-gray-900 capitalize">{registerData.userType}</span>
                  </div>
                </div>

                {/* Additional Contact Fields for Homeowners */}
                {registerData.userType === 'homeowner' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Property Address</label>
                      <input
                        type="text"
                        value={registerData.propertyAddress || ''}
                        onChange={(e) => setRegisterData({...registerData, propertyAddress: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Your dock slip address"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                      <input
                        type="text"
                        value={registerData.emergencyContact || ''}
                        onChange={(e) => setRegisterData({...registerData, emergencyContact: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Emergency contact name and phone"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setAuthStep('register')}
                    className="flex-1 bg-gray-500 text-white py-3 rounded-md hover:bg-gray-600 font-medium"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalRegistration}
                    className="flex-1 bg-green-600 text-white py-3 rounded-md hover:bg-green-700 font-medium"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            )}
            
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                {authStep === 'login' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      onClick={() => {
                        setRegisterData({ ...registerData, email: tempEmail });
                        setAuthStep('register');
                      }}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Sign up here
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      onClick={() => setAuthStep('login')}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Sign in here
                    </button>
                  </>
                )}
              </p>
              

            </div>
          </div>
        </div>
      )}



      {/* User Edit Modal */}
      {showUserEditModal && editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit User</h3>
                <button
                  onClick={() => {
                    setShowUserEditModal(false);
                    setEditingUser(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={(e) => { e.preventDefault(); handleSaveUser(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editingUser.email}
                    disabled
                    className="w-full p-3 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editingUser.phone}
                    onChange={(e) => setEditingUser({...editingUser, phone: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                  <select
                    value={editingUser.userType}
                    onChange={(e) => setEditingUser({...editingUser, userType: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="renter">Renter</option>
                    <option value="homeowner">Homeowner</option>
                  </select>
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserEditModal(false);
                      setEditingUser(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Edit Profile</h2>
              <button
                onClick={() => setShowProfileModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={currentUser?.email || ''}
                  disabled
                  className="w-full p-3 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingProfile.name}
                  onChange={(e) => setEditingProfile({...editingProfile, name: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editingProfile.phone}
                  onChange={(e) => setEditingProfile({...editingProfile, phone: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                {canManageUserRoles ? (
                <select
                  value={editingProfile.userType}
                    onChange={(e) => setEditingProfile({
                      ...editingProfile,
                      userType: normalizeUserType(e.target.value)
                    })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="renter">Renter</option>
                  <option value="homeowner">Homeowner</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                </select>
                ) : (
                  <div className="p-3 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-sm">
                    {editingProfile.userType === 'homeowner' ? 'Homeowner' : 'Renter'}
                  </div>
                )}
              </div>

              {/* Password Change Section */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Change Password</h3>
                <p className="text-sm text-gray-600 mb-4">Leave blank to keep current password</p>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={editingProfile.currentPassword}
                      onChange={(e) => setEditingProfile({...editingProfile, currentPassword: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter current password"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={editingProfile.newPassword}
                      onChange={(e) => setEditingProfile({...editingProfile, newPassword: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter new password (min 6 characters)"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={editingProfile.confirmNewPassword}
                      onChange={(e) => setEditingProfile({...editingProfile, confirmNewPassword: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// Wrapper component to provide Stripe Elements context
// export const DockRentalPlatformWrapper = () => {
//   const [clientSecret, setClientSecret] = useState(null);
  
//   return (
//     <Elements stripe={stripePromise} options={clientSecret ? { clientSecret } : undefined}>
//       <DockRentalPlatform onClientSecret={setClientSecret} />
//     </Elements>
//   );
// };

export default DockRentalPlatform;
// Force deployment Thu Sep 18 15:33:21 EDT 2025
// Force new deployment 1758224165
// Deployment fix Fri Sep 19 17:48:08 EDT 2025
