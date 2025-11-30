import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, MapPin, Anchor, Clock, DollarSign, User, Settings, Plus, Edit, Trash2, Check, X, Filter, Search, CreditCard, Lock, Eye, EyeOff } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { supabase } from './supabase';
import PaymentPage from './PaymentPage';
import { uploadUserDocument, uploadSlipImage, validateFile } from './storage-utils';
import { Dock82Logo } from './components/Dock82Logo';

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

const defaultAdminPermissions = {
  manage_slips: true,
  manage_bookings: true,
  view_analytics: true,
  manage_users: false,
  manage_admins: false,
  system_settings: false
};

const buildDefaultAdminForm = () => ({
  name: '',
  email: '',
  phone: '',
  userType: 'admin',
  permissions: { ...defaultAdminPermissions }
});

const DockRentalPlatform = () => {
  // Check for temp-password mode BEFORE any state initialization
  let initialTempPasswordMode = false;
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    initialTempPasswordMode = urlParams.get('temp-password') === 'true';
    
    // Check for expired recovery links in hash
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const hashStr = hash.toLowerCase();
      // Check for expired recovery link patterns
      if ((hashStr.includes('error=access_denied') || hashStr.includes('error_code=otp_expired')) && 
          (hashStr.includes('type=recovery') || hashStr.includes('recovery'))) {
        console.log('Expired recovery link detected, redirecting to forgot password');
        window.location.replace('/?forgot=true&expired=true');
      }
    }
  }
  
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
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    message: '',
    recipientIds: []
  });
  const [notificationSending, setNotificationSending] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState(null);
  const [expandedNotificationId, setExpandedNotificationId] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [allAdmins, setAllAdmins] = useState([]);
  const [newAdminData, setNewAdminData] = useState(buildDefaultAdminForm);
  const [newAdminErrors, setNewAdminErrors] = useState({});
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [editingAdminErrors, setEditingAdminErrors] = useState({});
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminDeletingId, setAdminDeletingId] = useState(null);
  const [showPermit, setShowPermit] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showCancellationModal, setShowCancellationModal] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [editingSlip, setEditingSlip] = useState(null);
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const [editingDescription, setEditingDescription] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [showBookingManagement, setShowBookingManagement] = useState(false);
  const [showFinancialReport, setShowFinancialReport] = useState(false);
  const [adminView, setAdminView] = useState('overview'); // overview, bookings, financials, settings
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(initialTempPasswordMode);
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
    userType: 'renter',
    propertyAddress: '',
    parcelNumber: '',
    lotNumber: '',
    emergencyContact: ''
  });
  const [userBookings, setUserBookings] = useState([]);
  const updateUserBookingsFromList = useCallback(
    (bookingList = [], user = currentUser) => {
      if (!user) {
        setUserBookings([]);
        return;
      }

      const filtered = bookingList.filter(booking =>
        (booking.user_id && booking.user_id === user.id) ||
        (!booking.user_id && booking.guestEmail === user.email)
      );

      setUserBookings(filtered);
    },
    [currentUser]
  );

  const fetchNotifications = useCallback(
    async (targetUserId) => {
      if (!targetUserId) {
        setNotifications([]);
        return;
      }
      setNotificationsLoading(true);
      setNotificationFeedback(null);
      try {
      const response = await fetch(`${API_BASE_URL}/api/notifications?user_id=${targetUserId}`);
      if (response.status === 404) {
        setNotifications([]);
        setNotificationFeedback(null);
        return;
      }
        if (!response.ok) {
          throw new Error('Failed to load notifications');
        }
        const data = await response.json();
        const normalized = (data.notifications || []).map((notification) => ({
          id: notification.id,
          title: notification.title || 'Notification',
          message: notification.message || '',
          createdAt: notification.created_at,
          readAt: notification.read_at,
          createdBy: notification.created_by,
          recipientId: notification.recipient_user_id
        }));
        setNotifications(normalized);
      setNotificationFeedback(null);
      } catch (error) {
      console.warn('Error fetching notifications:', error);
        setNotificationFeedback(error.message || 'Failed to load notifications.');
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    },
    [API_BASE_URL]
  );

  const [editingImage, setEditingImage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [commonEtiquette, setCommonEtiquette] = useState('');
  const [commonEtiquetteInitialized, setCommonEtiquetteInitialized] = useState(false);
  const [etiquetteSaving, setEtiquetteSaving] = useState(false);
  const [slips, setSlips] = useState([]);
  const [allSlips, setAllSlips] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [slipsLoading, setSlipsLoading] = useState(true);
  const [dataInitialized, setDataInitialized] = useState(false);
  const [newSlipForm, setNewSlipForm] = useState({
    name: '',
    description: '',
    pricePerNight: '',
    maxBoatLength: '',
    width: '',
    depth: '',
    amenities: '',
    dockEtiquette: '',
    locationSection: '',
    locationPosition: '',
    locationLat: '',
    locationLng: '',
    imageFile: null
  });
  const [newSlipFormErrors, setNewSlipFormErrors] = useState({});
  const [newSlipSubmitting, setNewSlipSubmitting] = useState(false);
  const [newSlipImagePreview, setNewSlipImagePreview] = useState(null);

  useEffect(() => {
    return () => {
      if (newSlipImagePreview) {
        URL.revokeObjectURL(newSlipImagePreview);
      }
    };
  }, [newSlipImagePreview]);
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
    homeownerInsuranceProof: null,
    // Removed rental property fields - simplified to just dock dates
  });

  // New simplified authentication states
  const [authStep, setAuthStep] = useState(initialTempPasswordMode ? 'reset-password' : 'login'); // 'login', 'register', 'verify-contact', 'forgot-password', 'reset-password'
  const [tempEmail, setTempEmail] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
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
  const [propertyOwners, setPropertyOwners] = useState([]);
  const [propertyOwnersLoading, setPropertyOwnersLoading] = useState(false);
  const [propertyOwnersError, setPropertyOwnersError] = useState(null);
  const [showPropertyOwnerEditModal, setShowPropertyOwnerEditModal] = useState(false);
  const [showDuesPayment, setShowDuesPayment] = useState(false);
  const [duesPaymentProcessing, setDuesPaymentProcessing] = useState(false);
  const [editingPropertyOwner, setEditingPropertyOwner] = useState(null);
  const [propertyOwnerSaving, setPropertyOwnerSaving] = useState(false);
  const [propertyOwnerFormErrors, setPropertyOwnerFormErrors] = useState({});
  const [propertyOwnerDeletingId, setPropertyOwnerDeletingId] = useState(null);
  const normalizeUserType = useCallback((value) => {
    if (!value) return 'renter';
    return value.toString().toLowerCase();
  }, []);
  
  // Helper function to check if user type is exempt from payment
  const isPaymentExempt = useCallback((userType) => {
    const normalized = normalizeUserType(userType);
    return normalized === 'homeowner' || normalized === 'admin' || normalized === 'superadmin';
  }, [normalizeUserType]);
  const formatUserTypeLabel = useCallback(
    (value) => {
      const normalized = normalizeUserType(value);
      switch (normalized) {
        case 'superadmin':
          return 'Superadmin';
        case 'admin':
          return 'Admin';
        case 'homeowner':
          return 'Homeowner';
        case 'renter':
          return 'Renter';
        default:
          if (!normalized) {
            return 'Unknown';
          }
          return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      }
    },
    [normalizeUserType]
  );
  const sortPropertyOwners = useCallback((owners = []) => {
    const priorityForOwner = (owner) => {
      const status = (owner?.homeowner_status || owner?.permissions?.homeowner_status || '')
        .toString()
        .toLowerCase();
      if (status === 'pending_verification' || status === 'pending') {
        return 0;
      }
      if (status === 'inactive_owner' || status === 'inactive owner' || status === 'inactive') {
        return 2;
      }
      return 1;
    };

    return [...owners].sort((a, b) => {
      const priorityDiff = priorityForOwner(a) - priorityForOwner(b);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const nameA = (a?.name || a?.email || '').toString().toLowerCase();
      const nameB = (b?.name || b?.email || '').toString().toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  }, []);
  const sortAdmins = useCallback(
    (admins = []) => {
      const getPriority = (admin) => {
        const normalized = normalizeUserType(admin?.user_type || admin?.userType || admin?.user_role);
        return normalized === 'superadmin' ? 0 : 1;
      };

      return [...admins].sort((a, b) => {
        const priorityDiff = getPriority(a) - getPriority(b);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        const nameA = (a?.name || a?.email || '').toString().toLowerCase();
        const nameB = (b?.name || b?.email || '').toString().toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
    },
    [normalizeUserType]
  );
  const loadAllUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to fetch users');
      }

      const data = await response.json();
      const usersList = data.users || [];
      console.log('Loaded users:', usersList.length, usersList.map(u => ({ email: u.email, user_type: u.user_type || u.userType })));
      setAllUsers(usersList);
      const homeownersFromUsers = usersList.filter(
        (user) => normalizeUserType(user.user_type || user.userType || user.user_role) === 'homeowner'
      );
      if (homeownersFromUsers.length) {
        setPropertyOwners(sortPropertyOwners(homeownersFromUsers));
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }, [API_BASE_URL, normalizeUserType, sortPropertyOwners]);
  const loadAllAdmins = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/admins`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to fetch admins');
      }

      const data = await response.json();
      setAllAdmins(sortAdmins(data.admins || []));
    } catch (error) {
      console.error('Error loading admins:', error);
    }
  }, [API_BASE_URL, sortAdmins]);
  const fetchHomeownerRecords = useCallback(async () => {
    setPropertyOwnersLoading(true);
    setPropertyOwnersError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`);
      if (!response.ok) {
        throw new Error('Failed to load property owners');
      }
      const data = await response.json();
      const owners = (data.users || []).filter((user) => {
        const normalizedType = normalizeUserType(user.user_type || user.userType || user.user_role);
        // Only show users with user_type = 'homeowner'
        return normalizedType === 'homeowner';
      });
      setPropertyOwners(sortPropertyOwners(owners));
    } catch (error) {
      console.error('Error loading homeowner records:', error);
      setPropertyOwners([]);
      setPropertyOwnersError(error.message || 'Failed to load property owners');
    } finally {
      setPropertyOwnersLoading(false);
    }
  }, [API_BASE_URL, normalizeUserType, sortPropertyOwners]);
  const homeownerAddressOptions = useMemo(() => {
    const unique = new Set();
    (propertyOwners || []).forEach((owner) => {
      if (owner?.property_address) {
        unique.add(owner.property_address);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [propertyOwners]);
  const homeownerStatusOptions = useMemo(
    () => [
      { value: 'verified', label: 'Verified' },
      { value: 'active_owner', label: 'Active Owner' },
      { value: 'inactive_owner', label: 'Inactive Owner' },
      { value: 'pending_verification', label: 'Pending Verification' },
      { value: '', label: 'Unknown / Not Set' }
    ],
    []
  );
  const pendingPropertyOwnersCount = useMemo(
    () =>
      propertyOwners.filter((owner) => {
        const status = (owner.homeowner_status || '').toString().toLowerCase();
        return status === 'pending_verification' || status === 'pending';
      }).length,
    [propertyOwners]
  );
  const hasValidOwnerEmail = useCallback(
    (owner) => owner?.email && !owner.email.startsWith('no-email-'),
    []
  );
  const currentUserType = currentUser ? normalizeUserType(currentUser.user_type || currentUser.userType || currentUser.user_role) : null;

  useEffect(() => {
    if (!currentUser || currentUserType !== 'homeowner' || !propertyOwners.length) {
      return;
    }

    const currentEmail = (currentUser.email || '').toLowerCase();
    if (!currentEmail) {
      return;
    }

    const matchingOwner = propertyOwners.find(
      (owner) => (owner.email || '').toLowerCase() === currentEmail
    );

    if (!matchingOwner) {
      return;
    }

    const nextStatus = matchingOwner.homeowner_status || null;
    const nextVerifiedAt = matchingOwner.homeowner_verified_at || matchingOwner.homeownerVerifiedAt || null;
    const currentStatus = currentUser.homeowner_status || currentUser.homeownerStatus || null;
    const currentVerifiedAt = currentUser.homeowner_verified_at || currentUser.homeownerVerifiedAt || null;

    if (nextStatus !== currentStatus || nextVerifiedAt !== currentVerifiedAt) {
      setCurrentUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          homeowner_status: nextStatus,
          homeownerStatus: nextStatus,
          homeowner_verified_at: nextVerifiedAt,
          homeownerVerifiedAt: nextVerifiedAt
        };
      });
    }
  }, [currentUser, currentUserType, propertyOwners]);

  const [newPropertyOwnerForm, setNewPropertyOwnerForm] = useState({
    name: '',
    email: '',
    phone: '',
    propertyAddress: '',
    parcelNumber: '',
    lotNumber: '',
    homeownerStatus: 'active_owner',
    userType: 'homeowner'
  });
  const [newPropertyOwnerSubmitting, setNewPropertyOwnerSubmitting] = useState(false);
  const [newPropertyOwnerErrors, setNewPropertyOwnerErrors] = useState({});

  // Slips data loaded from Supabase only

  useEffect(() => {
    fetchHomeownerRecords();
  }, [fetchHomeownerRecords]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  useEffect(() => {
    if (commonEtiquetteInitialized) {
      return;
    }

    if (!slips || slips.length === 0) {
      return;
    }

    const trimmedRules = slips
      .map((slip) => (slip.dockEtiquette || '').trim())
      .filter((rule) => rule.length > 0);

    if (trimmedRules.length === 0) {
      setCommonEtiquette('');
      setCommonEtiquetteInitialized(true);
      return;
    }

    const uniqueRules = Array.from(new Set(trimmedRules));
    if (uniqueRules.length === 1) {
      setCommonEtiquette(uniqueRules[0]);
    } else {
      setCommonEtiquette('');
    }

    setCommonEtiquetteInitialized(true);
  }, [slips, commonEtiquetteInitialized]);

  const canManageUserRoles = currentUserType === 'admin' || currentUserType === 'superadmin';
  const handleClosePropertyOwnerModal = useCallback(() => {
    setShowPropertyOwnerEditModal(false);
    setEditingPropertyOwner(null);
    setPropertyOwnerFormErrors({});
    setPropertyOwnerSaving(false);
  }, []);
  const resetNewPropertyOwnerForm = useCallback(() => {
    setNewPropertyOwnerForm({
      name: '',
      email: '',
      phone: '',
      propertyAddress: '',
      parcelNumber: '',
      lotNumber: '',
      homeownerStatus: 'active_owner',
      userType: 'homeowner'
    });
    setNewPropertyOwnerErrors({});
    setNewPropertyOwnerSubmitting(false);
  }, []);
  const handleNewPropertyOwnerInput = useCallback((field, value) => {
    setNewPropertyOwnerForm((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);
  const updatePropertyOwnerForm = useCallback((field, value) => {
    setEditingPropertyOwner((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);
  const handleEditPropertyOwner = useCallback(
    (owner) => {
      if (!owner) return;

      const normalizedType = normalizeUserType(owner.user_type || owner.userType || owner.user_role || 'homeowner');
      setEditingPropertyOwner({
        id: owner.id,
        name: owner.name || '',
        email: hasValidOwnerEmail(owner) ? owner.email : '',
        phone: owner.phone || '',
        userType: normalizedType,
        propertyAddress: owner.property_address || '',
        parcelNumber: owner.parcel_number || '',
        lotNumber: owner.lot_number || '',
        homeownerStatus: owner.homeowner_status || '',
        dues: owner.dues || null
      });
      setPropertyOwnerFormErrors({});
      setPropertyOwnerSaving(false);
      setShowPropertyOwnerEditModal(true);
    },
    [hasValidOwnerEmail, normalizeUserType]
  );
  const handleSavePropertyOwner = async () => {
    if (!editingPropertyOwner) {
      return;
    }

    const errors = {};
    if (!editingPropertyOwner.name || !editingPropertyOwner.name.trim()) {
      errors.name = 'Name is required';
    }
    if (editingPropertyOwner.email && editingPropertyOwner.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editingPropertyOwner.email.trim())) {
        errors.email = 'Please enter a valid email address';
      }
    }
    if (!editingPropertyOwner.userType) {
      errors.userType = 'User type is required';
    }

    if (Object.keys(errors).length > 0) {
      setPropertyOwnerFormErrors(errors);
      return;
    }

    setPropertyOwnerFormErrors({});
    setPropertyOwnerSaving(true);

    const sanitizeOptional = (value) => {
      if (value === undefined || value === null) {
        return null;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      }
      return value;
    };

    try {
      const normalizedUserType = normalizeUserType(editingPropertyOwner.userType || 'homeowner');
      const payload = {
        name: editingPropertyOwner.name.trim(),
        userType: normalizedUserType,
        email: sanitizeOptional(editingPropertyOwner.email),
        phone: sanitizeOptional(editingPropertyOwner.phone),
        propertyAddress: sanitizeOptional(editingPropertyOwner.propertyAddress),
        parcelNumber: sanitizeOptional(editingPropertyOwner.parcelNumber),
        lotNumber: sanitizeOptional(editingPropertyOwner.lotNumber),
        homeownerStatus: sanitizeOptional(editingPropertyOwner.homeownerStatus),
        dues: editingPropertyOwner.dues !== undefined && editingPropertyOwner.dues !== null && editingPropertyOwner.dues !== '' 
          ? parseFloat(editingPropertyOwner.dues) 
          : null
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/users/${editingPropertyOwner.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json().catch(() => null);

      if (!response.ok || !responseData?.success) {
        throw new Error(responseData?.details || responseData?.error || 'Failed to update property owner');
      }

      const updatedOwner = responseData.user;
      console.log('Property owner update response:', {
        updatedOwner,
        dues: updatedOwner?.dues,
        homeownerStatus: updatedOwner?.homeowner_status || updatedOwner?.homeownerStatus,
        payload: payload
      });
      
      setPropertyOwners((prev) =>
        sortPropertyOwners(
          prev.map((owner) => (owner.id === updatedOwner.id ? updatedOwner : owner))
        )
      );
      await fetchHomeownerRecords();
      handleClosePropertyOwnerModal();
      alert('✅ Property owner updated successfully!');
    } catch (error) {
      console.error('Error updating property owner:', error);
      setPropertyOwnerFormErrors({
        general: error.message || 'Failed to update property owner. Please try again.'
      });
    } finally {
      setPropertyOwnerSaving(false);
    }
  };
  const handleCreatePropertyOwner = useCallback(async (event) => {
    event.preventDefault();

    const errors = {};
    const normalizedOwnerUserType = normalizeUserType(newPropertyOwnerForm.userType || 'homeowner');
    if (!newPropertyOwnerForm.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!newPropertyOwnerForm.email.trim()) {
      errors.email = 'Email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newPropertyOwnerForm.email.trim())) {
        errors.email = 'Please enter a valid email address';
      }
    }
    if (!newPropertyOwnerForm.propertyAddress.trim()) {
      errors.propertyAddress = 'Property Address is required';
    }
    if (!newPropertyOwnerForm.lotNumber.trim()) {
      errors.lotNumber = 'Lot Number is required';
    }
    if (!newPropertyOwnerForm.userType) {
      errors.userType = 'User type is required';
    } else if (!['homeowner', 'renter'].includes(normalizedOwnerUserType)) {
      errors.userType = 'Property owners can only be homeowners or renters';
    }

    if (Object.keys(errors).length > 0) {
      setNewPropertyOwnerErrors(errors);
      return;
    }

    setNewPropertyOwnerErrors({});
    setNewPropertyOwnerSubmitting(true);

    const sanitizeValue = (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    try {
      const payload = {
        name: newPropertyOwnerForm.name.trim(),
        email: sanitizeValue(newPropertyOwnerForm.email),
        phone: sanitizeValue(newPropertyOwnerForm.phone),
        propertyAddress: sanitizeValue(newPropertyOwnerForm.propertyAddress),
        parcelNumber: sanitizeValue(newPropertyOwnerForm.parcelNumber),
        lotNumber: sanitizeValue(newPropertyOwnerForm.lotNumber),
        homeownerStatus: sanitizeValue(newPropertyOwnerForm.homeownerStatus),
        userType: normalizedOwnerUserType
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json().catch(() => null);

      if (!response.ok || !responseData?.success) {
        throw new Error(responseData?.details || responseData?.error || 'Failed to create property owner');
      }

      await fetchHomeownerRecords();
      resetNewPropertyOwnerForm();
      alert('✅ Property owner added successfully!');
    } catch (error) {
      console.error('Error creating property owner:', error);
      setNewPropertyOwnerErrors({
        general: error.message || 'Failed to add property owner. Please try again.'
      });
    } finally {
      setNewPropertyOwnerSubmitting(false);
    }
  }, [API_BASE_URL, fetchHomeownerRecords, newPropertyOwnerForm, resetNewPropertyOwnerForm]);
  const handleDeletePropertyOwner = useCallback(
    async (owner) => {
      if (!owner?.id) {
        alert('Unable to delete property owner: missing identifier.');
        return;
      }

      const confirmDelete = window.confirm(
        `Delete property owner "${owner.name || owner.email || owner.id}"?\n\nThis action cannot be undone.`
      );

      if (!confirmDelete) {
        return;
      }

      setPropertyOwnerDeletingId(owner.id);
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${owner.id}`, {
          method: 'DELETE'
        });

        const responseData = await response.json().catch(() => null);

        if (!response.ok || !responseData?.success) {
          throw new Error(responseData?.details || responseData?.error || 'Failed to delete property owner');
        }

        setPropertyOwners((prev) =>
          sortPropertyOwners(prev.filter((existing) => existing.id !== owner.id))
        );
        await fetchHomeownerRecords();
        alert('✅ Property owner deleted successfully!');
      } catch (error) {
        console.error('Error deleting property owner:', error);
        alert(error.message || '❌ Failed to delete property owner. Please try again.');
      } finally {
        setPropertyOwnerDeletingId(null);
      }
  },
    [API_BASE_URL, fetchHomeownerRecords, sortPropertyOwners]
  );
  const resetNewAdminForm = useCallback(() => {
    setNewAdminData(buildDefaultAdminForm());
    setNewAdminErrors({});
    setAdminSubmitting(false);
  }, []);
  const handleNewAdminInput = useCallback((field, value) => {
    setNewAdminData((prev) => ({
      ...prev,
      [field]: value
    }));
    setNewAdminErrors((prev) => {
      if (!prev || !Object.prototype.hasOwnProperty.call(prev, field)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);
  const handleEditAdmin = useCallback(
    (admin) => {
      if (!admin) return;

      setEditingAdmin({
        id: admin.id,
        name: admin.name || '',
        email: admin.email || '',
        phone: admin.phone || '',
        userType: normalizeUserType(admin.user_type || admin.userType || admin.user_role || 'admin')
      });
      setEditingAdminErrors({});
      setAdminSaving(false);
      setShowAdminEditModal(true);
    },
    [normalizeUserType]
  );
  const handleCloseAdminModal = useCallback(() => {
    setShowAdminEditModal(false);
    setEditingAdmin(null);
    setEditingAdminErrors({});
    setAdminSaving(false);
  }, []);
  const updateEditingAdmin = useCallback((field, value) => {
    setEditingAdmin((prev) => (prev ? { ...prev, [field]: value } : prev));
    setEditingAdminErrors((prev) => {
      if (!prev || !Object.prototype.hasOwnProperty.call(prev, field)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);
  const deriveHomeownerStatus = useCallback(
    (owner) => {
      if (!owner) {
        return { label: 'Unknown', className: 'bg-gray-100 text-gray-800' };
      }

      const rawStatus = (owner.homeowner_status || '').toString().toLowerCase();
      const verifiedAt = owner.homeowner_verified_at || owner.homeownerVerifiedAt;

      if (rawStatus === 'verified') {
        return { label: 'Verified', className: 'bg-green-100 text-green-800' };
      }

      if (rawStatus === 'pending_verification' || rawStatus === 'pending') {
        return { label: 'Pending Verification', className: 'bg-yellow-100 text-yellow-800' };
      }

      if (rawStatus === 'inactive_owner' || rawStatus === 'inactive owner' || rawStatus === 'inactive') {
        return { label: 'Inactive Owner', className: 'bg-red-100 text-red-800' };
      }

      if (rawStatus) {
        if (rawStatus === 'active_owner' || rawStatus === 'active owner' || rawStatus === 'active') {
          return { label: 'Active Owner', className: 'bg-green-50 text-green-700' };
        }

        return {
          label: rawStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          className: 'bg-blue-100 text-blue-800'
        };
      }

      if (normalizeUserType(owner.user_type || owner.userType || owner.user_role) === 'homeowner') {
        if (verifiedAt || owner.email_verified) {
          return { label: 'Verified', className: 'bg-green-100 text-green-800' };
        }
        return { label: 'Active Owner', className: 'bg-green-50 text-green-700' };
      }

      return { label: 'Unknown', className: 'bg-gray-100 text-gray-800' };
    },
    [normalizeUserType]
  );


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
      const status = (slip.status || '').toLowerCase();
      const isAvailable =
        typeof slip.available === 'boolean' ? slip.available : status !== 'inactive';

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
        available: isAvailable,
        status,
        images
      };
    });
  };

  const applySlipUpdate = (updatedSlip) => {
    if (!updatedSlip) {
      return;
    }

    setSlips((prevSlips) =>
      prevSlips.map((slip) => (slip.id === updatedSlip.id ? { ...slip, ...updatedSlip } : slip))
    );

    setAllSlips((prevSlips) =>
      prevSlips.map((slip) => (slip.id === updatedSlip.id ? { ...slip, ...updatedSlip } : slip))
    );
  };

  const patchSlip = async (slipId, payload) => {
    const response = await fetch(`${API_BASE_URL}/api/slips/${slipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data?.error || data?.details || 'Failed to update slip';
      throw new Error(errorMessage);
    }

    if (data?.success && data?.slip) {
      const [transformed] = transformSlipsData([data.slip]);
      if (transformed) {
        return transformed;
      }
    }

    return null;
  };

  const refreshSlipsFromServer = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/slips`);
      if (!response.ok) {
        throw new Error('Failed to fetch slips');
      }
      const slipsData = await response.json();
      const transformed = transformSlipsData(slipsData.slips || []);
      setSlips(transformed);
      setAllSlips(transformed);
      return transformed;
    } catch (error) {
      console.error('Error refreshing slips:', error);
      throw error;
    }
  }, [API_BASE_URL]);

  const addSlips = useCallback(async ({ slipPayload, generateDefault } = {}) => {
    const payload = generateDefault ? { generateDefault: true } : { slip: slipPayload };

    const response = await fetch(`${API_BASE_URL}/api/add-new-slips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success) {
      const errorMessage = data?.error || data?.details || 'Failed to add slips';
      throw new Error(errorMessage);
    }

    return data.slips || [];
  }, [API_BASE_URL]);

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

  const getPaymentStatusLabel = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'pending':
        return 'Awaiting approval (card on hold)';
      case 'paid':
        return 'Paid';
      case 'refunded':
        return 'Refunded';
      case 'failed':
        return 'Authorization voided';
      case 'partial':
        return 'Partially refunded';
      case 'exempt':
        return 'Exempt (no charge)';
      default:
        return status || 'Unknown';
    }
  };

  const markNotificationAsRead = useCallback(
    async (notification) => {
      if (!currentUser?.id || notification.readAt) {
        return;
      }
      try {
        await fetch(`${API_BASE_URL}/api/notifications/${notification.id}/read`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id })
        });
      } catch (error) {
        console.warn('Error marking notification as read:', error);
      }
    },
    [API_BASE_URL, currentUser?.id]
  );

  const formatDateTime = (value) => {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  };

  const toggleNotificationExpansion = (notification) => {
    setExpandedNotificationId((prev) =>
      prev === notification.id ? null : notification.id
    );

    if (!notification.readAt) {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
        )
      );
      markNotificationAsRead(notification);
    }
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
        
        // Check if we're in temp-password mode - if so, skip auto-login
        const urlParams = new URLSearchParams(window.location.search);
        const isTempPasswordMode = urlParams.get('temp-password') === 'true';
        
        if (isTempPasswordMode) {
          console.log('AUTH DEBUG - Temp password mode detected in initializeAuth, skipping auto-login');
          // Keep modal open and reset step active
          setShowLoginModal(true);
          setAuthStep('reset-password');
          setSessionLoading(false);
          return; // Don't proceed with session restoration
        }
        
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
          
          // Set admin mode if admin or superadmin
          if (userProfile.user_type === 'admin' || userProfile.user_type === 'superadmin') {
            setAdminMode(true);
            // Set superadmin mode only for superadmin (for managing admins)
            if (userProfile.user_type === 'superadmin') {
              setSuperAdminMode(true);
            }
          }
          
          // Load user's bookings - filter by user_id (with fallback to email for backward compatibility)
          // Only update if bookings are available
          if (bookings && bookings.length > 0) {
            updateUserBookingsFromList(bookings, userProfile);
          }
          
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

    // Check for password reset parameter in URL FIRST (before auth init)
    const urlParams = new URLSearchParams(window.location.search);
    const isTempPasswordMode = urlParams.get('temp-password') === 'true';
    const isForgotMode = urlParams.get('forgot') === 'true';
    const isExpired = urlParams.get('expired') === 'true';
    
    // If temp password mode, show login form with reset password step
    // Set state immediately and ensure it persists
    if (isTempPasswordMode) {
      console.log('AUTH DEBUG - Temp password mode detected in useEffect, setting state');
      // Use functional updates to ensure state is set
      setShowLoginModal(true);
      setAuthStep('reset-password');
      // DON'T clean URL - keep it so the state persists
      // We'll clean it only when the user successfully resets their password
    }

    // Initialize auth state (but don't let it override temp-password mode)
    initializeAuth();

    // Safety timeout - ensure sessionLoading is set to false even if something hangs
    const timeoutId = setTimeout(() => {
      console.warn('AUTH DEBUG - Session loading timeout, forcing completion');
      setSessionLoading(false);
    }, 5000); // 5 second timeout (reduced from 10)
    
    if (isForgotMode) {
      // Show forgot password form
      setShowLoginModal(true);
      setAuthStep('forgot-password');
      if (isExpired) {
        // Show message about expired link
        setTimeout(() => {
          alert('⚠️ The password reset link has expired. Please request a new password reset link.');
        }, 100);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AUTH DEBUG - Auth state changed:', event, session?.user?.email);
        
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          // Check if user has a temp password - if so, show reset form
          try {
            const userCheckResponse = await fetch(`${API_BASE_URL}/api/user-profile?email=${encodeURIComponent(session.user.email)}`);
            if (userCheckResponse.ok) {
              const userCheckResult = await userCheckResponse.json();
              if (userCheckResult.success && userCheckResult.profile) {
                // Check if user has a temp password stored (in reset_token field)
                if (userCheckResult.profile.reset_token && 
                    userCheckResult.profile.reset_token_expires && 
                    new Date(userCheckResult.profile.reset_token_expires) > new Date()) {
                  // This is a temp password - show reset form instead of logging in
                  console.log('AUTH DEBUG - Temporary password detected, showing reset form');
                  setTempEmail(session.user.email);
                  setShowLoginModal(true);
                  setAuthStep('reset-password');
                  // Don't set current user or load profile - user needs to reset password first
                  return;
                }
              }
            }
          } catch (checkError) {
            console.error('Error checking for temp password:', checkError);
            // Continue with normal login if check fails
          }
          
          // Check if we're in temp-password mode - if so, don't auto-login, show reset form instead
          const urlParams = new URLSearchParams(window.location.search);
          const isTempPasswordMode = urlParams.get('temp-password') === 'true';
          const isInResetStep = authStep === 'reset-password';
          
          if (isTempPasswordMode || isInResetStep) {
            console.log('AUTH DEBUG - Temp password mode detected, keeping reset form open');
            // Don't set user or close modal - user needs to reset password first
            // Check if user has temp password
            try {
              const userCheckResponse = await fetch(`${API_BASE_URL}/api/user-profile?email=${encodeURIComponent(session.user.email)}`);
              if (userCheckResponse.ok) {
                const userCheckResult = await userCheckResponse.json();
                if (userCheckResult.success && userCheckResult.profile) {
                  if (userCheckResult.profile.reset_token && 
                      userCheckResult.profile.reset_token_expires && 
                      new Date(userCheckResult.profile.reset_token_expires) > new Date()) {
                    // User has temp password - keep reset form open
                    setShowLoginModal(true);
                    setAuthStep('reset-password');
                    setTempEmail(session.user.email);
                    return;
                  }
                }
              }
            } catch (checkError) {
              console.error('Error checking for temp password:', checkError);
            }
          }
          
          // User signed in or token refreshed (including after email confirmation)
          console.log('AUTH DEBUG - User authenticated, ensuring profile exists in database');
          try {
          const userProfile = await ensureUserProfile(session.user);
          
          if (userProfile) {
          setCurrentUser(userProfile);
          
          // Set admin mode if admin or superadmin
          if (userProfile.user_type === 'admin' || userProfile.user_type === 'superadmin') {
            setAdminMode(true);
            // Set superadmin mode only for superadmin (for managing admins)
            if (userProfile.user_type === 'superadmin') {
              setSuperAdminMode(true);
            }
          }
          
          // Load user's bookings - only if bookings are available
          if (bookings && bookings.length >= 0) {
            updateUserBookingsFromList(bookings, userProfile);
          }
          
          // Only close login modal if not in reset-password step
          if (authStep !== 'reset-password') {
            setShowLoginModal(false);
          }
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
          // Don't reset authStep if we're in temp-password mode
          const urlParams = new URLSearchParams(window.location.search);
          const isTempPasswordMode = urlParams.get('temp-password') === 'true';
          if (!isTempPasswordMode && authStep !== 'reset-password') {
            setAuthStep('login');
          }
        } else if (event === 'INITIAL_SESSION' && !session) {
          // Initial session check with no session - preserve temp-password mode if active
          const urlParams = new URLSearchParams(window.location.search);
          const isTempPasswordMode = urlParams.get('temp-password') === 'true';
          if (isTempPasswordMode) {
            console.log('AUTH DEBUG - INITIAL_SESSION with no session, preserving temp-password mode');
            setShowLoginModal(true);
            setAuthStep('reset-password');
          }
        }
      }
    );

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      clearTimeout(timeoutId);
    };
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
    updateUserBookingsFromList(bookings);
  }, [bookings, updateUserBookingsFromList]);

  useEffect(() => {
    if (currentView === 'bookings') {
      updateUserBookingsFromList(bookings);
    }
  }, [currentView, bookings, updateUserBookingsFromList]);

  useEffect(() => {
    if (currentUser?.id) {
      fetchNotifications(currentUser.id);
    } else {
      setNotifications([]);
    }
  }, [currentUser?.id, fetchNotifications]);
  useEffect(() => {
    if (superAdminMode) {
      loadAllAdmins();
    } else {
      setAllAdmins([]);
    }
  }, [superAdminMode, loadAllAdmins]);
  useEffect(() => {
    if (adminView === 'users' && superAdminMode && allAdmins.length === 0) {
      loadAllAdmins();
    }
  }, [adminView, superAdminMode, allAdmins.length, loadAllAdmins]);

  useEffect(() => {
    if (currentView === 'notifications' && adminMode && allUsers.length === 0) {
      loadAllUsers();
    }
  }, [currentView, adminMode, allUsers.length]);
  
  useEffect(() => {
    // Load all users when viewing admin overview to ensure Registered Renters section has accurate data
    if (currentView === 'admin' && adminView === 'overview' && adminMode && allUsers.length === 0) {
      loadAllUsers();
    }
  }, [currentView, adminView, adminMode, allUsers.length, loadAllUsers]);

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
    
    if (isPaymentExempt(booking.userType)) {
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
      paymentStatus: isPaymentExempt(booking.userType) ? 'exempt' : 
                     refundAmount === booking.totalCost ? 'refunded' : 
                     refundAmount > 0 ? 'partially_refunded' : 'non_refundable'
    };

    setBookings(bookings.map(b => b.id === booking.id ? updatedBooking : b));

    setShowCancellationModal(null);
    setCancellationReason('');
    
    if (isPaymentExempt(booking.userType)) {
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
    if (!editingSlip) {
      return;
    }

    try {
      const updatedSlip = await patchSlip(editingSlip.id, { description: editingDescription });
      applySlipUpdate(updatedSlip || { ...editingSlip, description: editingDescription });
            alert('✅ Slip description updated successfully!');
      handleCancelEdit();
      } catch (error) {
      console.error('Error updating slip description:', error);
      alert(`❌ Failed to update slip. ${error.message || 'Please try again.'}`);
    }
  };

  const handleCancelEdit = () => {
    if (editingImage && typeof editingImage === 'string' && editingImage.startsWith('blob:')) {
      URL.revokeObjectURL(editingImage);
    }

    setEditingSlip(null);
    setEditingDescription('');
    setEditingPrice('');
    setEditingImage('');
    setImageFile(null);
    setImageUploadError('');
    setIsUploading(false);
  };

  const handleEditPrice = (slip) => {
    setEditingSlip(slip);
    setEditingPrice(slip.price_per_night.toString());
  };

  const handleSavePrice = async () => {
    if (!editingSlip) {
      return;
    }

    const parsedPrice = parseFloat(editingPrice);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      alert('Please enter a valid price.');
      return;
    }

    try {
      const updatedSlip = await patchSlip(editingSlip.id, { price_per_night: parsedPrice });
      applySlipUpdate(updatedSlip || { ...editingSlip, price_per_night: parsedPrice });
            alert('✅ Slip price updated successfully!');
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating slip price:', error);
      alert(`❌ Failed to update slip. ${error.message || 'Please try again.'}`);
    }
  };

  const handleStartImageEdit = (slip) => {
    if (editingImage && typeof editingImage === 'string' && editingImage.startsWith('blob:')) {
      URL.revokeObjectURL(editingImage);
    }

    const currentImage = Array.isArray(slip.images)
      ? slip.images[0] || ''
      : (typeof slip.images === 'string' ? slip.images : '');

    setEditingSlip({ ...slip, editingType: 'image' });
    setEditingImage(currentImage || '');
    setImageFile(null);
    setImageUploadError('');
  };

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const validation = validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 10);
    if (!validation.valid) {
      setImageUploadError(validation.error);
      return;
    }

    if (editingImage && typeof editingImage === 'string' && editingImage.startsWith('blob:')) {
      URL.revokeObjectURL(editingImage);
    }

    setImageUploadError('');
    setImageFile(file);
    setEditingImage(URL.createObjectURL(file));
  };

  const handleSaveImage = async () => {
    if (!editingSlip) {
      return;
    }

    if (!imageFile) {
      setImageUploadError('Please choose an image to upload.');
      return;
    }

    const validation = validateFile(imageFile, ['image/jpeg', 'image/png', 'image/webp'], 10);
    if (!validation.valid) {
      setImageUploadError(validation.error);
      return;
    }

    setIsUploading(true);
    setImageUploadError('');

    try {
      const uploadResult = await uploadSlipImage(imageFile, editingSlip.id);
      if (!uploadResult?.success || !uploadResult.url) {
        throw new Error(uploadResult?.error || 'Failed to upload image');
      }

      const updatedSlip = await patchSlip(editingSlip.id, { images: [uploadResult.url] });
      applySlipUpdate(updatedSlip || { ...editingSlip, images: [uploadResult.url] });

      alert('✅ Slip image updated successfully!');
      handleCancelEdit();
      } catch (error) {
      console.error('Error updating slip image:', error);
      setImageUploadError(error.message || 'Failed to update slip image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveCommonEtiquette = async () => {
    if (!slips.length) {
      alert('No slips available to update.');
      return;
    }

    setEtiquetteSaving(true);

    try {
      await Promise.all(
        slips.map((slip) => patchSlip(slip.id, { dock_etiquette: commonEtiquette }))
      );

      setSlips((prev) => prev.map((slip) => ({ ...slip, dockEtiquette: commonEtiquette })));
      setAllSlips((prev) => prev.map((slip) => ({ ...slip, dockEtiquette: commonEtiquette })));

      alert('✅ Dock etiquette updated for all slips!');
      setCommonEtiquetteInitialized(true);
    } catch (error) {
      console.error('Error updating dock etiquette:', error);
      alert(`❌ Failed to update dock etiquette. ${error.message || 'Please try again.'}`);
    } finally {
      setEtiquetteSaving(false);
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

  const handleDuesPayment = async (paymentResult) => {
    if (!currentUser || !currentUser.dues) {
      return;
    }

    setDuesPaymentProcessing(true);
    try {
      // Process payment via backend
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/pay-dues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.id,
          amount: currentUser.dues,
          paymentIntentId: paymentResult.paymentIntentId
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        // Update current user to remove dues and reactivate
        const updatedUser = {
          ...currentUser,
          dues: null,
          homeowner_status: 'verified',
          homeownerStatus: 'verified'
        };
        setCurrentUser(updatedUser);
        setShowDuesPayment(false);
        
        // Refresh notifications to show the payment success notification
        // Add a small delay to ensure backend has created the notification
        if (updatedUser.id) {
          console.log('🔄 Refreshing notifications after dues payment...');
          setTimeout(() => {
            fetchNotifications(updatedUser.id);
          }, 1000); // Wait 1 second for backend to create notification
        }
        
        alert('✅ Payment successful! Your account has been reactivated.');
      } else {
        throw new Error(result.error || 'Payment processing failed');
      }
    } catch (error) {
      console.error('Dues payment error:', error);
      alert(`❌ Payment failed: ${error.message || 'Please try again.'}`);
    } finally {
      setDuesPaymentProcessing(false);
    }
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
      const finalTotal = isPaymentExempt(bookingData.userType)
        ? 0
        : baseTotal - discount;

      // Upload files to Supabase Storage before creating booking
      let rentalAgreementPath = null;
      let insuranceProofPath = null;
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

        if (isPaymentExempt(bookingData.userType) && authUserId) {
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

      const rentalAgreementName = isPaymentExempt(bookingData.userType)
        ? null
        : bookingData.rentalAgreement?.name || null;
      const finalRentalAgreementPath = isPaymentExempt(bookingData.userType)
        ? null
        : rentalAgreementPath;

      const insuranceProofName = isPaymentExempt(bookingData.userType)
        ? bookingData.homeownerInsuranceProof?.name || null
        : bookingData.insuranceProof?.name || null;
      const finalInsuranceProofPath = isPaymentExempt(bookingData.userType)
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
          status: isPaymentExempt(bookingData.userType) ? 'confirmed' : 'pending',
          payment_status: isPaymentExempt(bookingData.userType) ? 'paid' : 'pending',
        payment_date: isPaymentExempt(bookingData.userType) ? new Date().toISOString() : null,
          payment_method: isPaymentExempt(bookingData.userType) ? 'exempt' : 'stripe',
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
          status: isPaymentExempt(bookingData.userType) ? 'confirmed' : 'pending',
          paymentStatus: isPaymentExempt(bookingData.userType) ? 'paid' : 'pending',
          payment_status: isPaymentExempt(bookingData.userType) ? 'paid' : 'pending',
          rentalAgreementName: rentalAgreementName,
          rentalAgreementPath: finalRentalAgreementPath,
          insuranceProofName: insuranceProofName,
          insuranceProofPath: finalInsuranceProofPath,
          boatPicturePath: boatPicturePath,
          paymentIntentId: paymentResult.paymentIntentId
        };
        const backupBookings = [...bookings, tempBooking];
        setBookings(backupBookings);
        setAllBookings([...allBookings, tempBooking]);
        updateUserBookingsFromList(backupBookings, currentUser);
        setShowPaymentPage(false);
        setCurrentView('browse');
        return;
      }

      const created = await createResponse.json();
      const newBookingData = created.booking;
      console.log('Booking inserted successfully via API:', newBookingData);

      // Update local bookings state with confirmed booking
      const [normalizedBooking] = transformBookingsData([newBookingData], allSlips.length ? allSlips : slips);

      const updatedBookings = [...bookings, normalizedBooking];
      setBookings(updatedBookings);
      setAllBookings([...allBookings, normalizedBooking]);
      updateUserBookingsFromList(updatedBookings, currentUser);
      
      setShowPaymentPage(false);
      setCurrentView('browse');
      
      // Send confirmation emails
      await sendEmailNotification('bookingPending', bookingData.guestEmail, {
        guestName: bookingData.guestName,
        slipName: selectedSlip.name,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        boatMakeModel: bookingData.boatMakeModel,
        boatLength: bookingData.boatLength,
        totalAmount: finalTotal
      });

      // Show different message based on payment exemption status
      if (isPaymentExempt(bookingData.userType)) {
        const userTypeLabel = formatUserTypeLabel(bookingData.userType);
        alert(`✅ Booking confirmed! Your ${userTypeLabel.toLowerCase()} booking has been automatically confirmed. No payment required.`);
      } else {
        alert('Payment authorization successful! Your booking request has been submitted for approval. Your card will be charged only after Dock82 confirms the reservation.');
      }
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

    if (bookingData.userType === 'homeowner') {
      const homeownerStatus = (
        currentUser?.homeowner_status ||
        currentUser?.homeownerStatus ||
        ''
      )
        .toString()
        .toLowerCase();
      const allowedStatuses = new Set(['verified', 'active_owner', 'active owner', 'active']);
      if (!allowedStatuses.has(homeownerStatus)) {
        alert(
          'Your homeowner account is pending Dock82 approval. Please contact support if you need assistance with verification.'
        );
        setCurrentView('browse');
        return;
      }
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

    if (parseInt(bookingData.boatLength) > selectedSlip.max_length) {
      alert(`Boat length cannot exceed ${selectedSlip.max_length} feet for this dock slip.`);
      return;
    }

    const totalInfo = calculateBookingTotal(bookingData.checkIn, bookingData.checkOut, selectedSlip.price_per_night);
    const totalCost = isPaymentExempt(bookingData.userType) ? 0 : totalInfo.finalTotal;

    // For renters, show payment page instead of processing payment directly
    // Admins and superadmins (like homeowners) skip payment and auto-confirm
    if (bookingData.userType === 'renter') {
      setShowPaymentPage(true);
      return;
    }

    await handlePaymentComplete({
      paymentIntentId: `${isPaymentExempt(bookingData.userType) ? normalizeUserType(bookingData.userType) : 'homeowner'}-${Date.now()}`,
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

  const filteredSlips = sortSlips(
    slips.filter((slip) => {
      if (!slip.available) return false;

      // Filter by max length
      if (searchFilters.maxLength && parseInt(searchFilters.maxLength) > slip.max_length) {
        return false;
      }

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
    })
  );

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
    const slipActive = Boolean(slip.available);

    const availabilityBadgeClass = !slipActive
      ? 'bg-red-100 text-red-800'
      : isDateFilterActive
        ? slipAvailableForRange
          ? 'bg-green-100 text-green-800'
          : 'bg-yellow-100 text-yellow-800'
        : 'bg-green-100 text-green-800';

    const availabilityBadgeLabel = !slipActive
      ? 'Inactive'
      : isDateFilterActive
        ? slipAvailableForRange
          ? 'Available'
          : 'Unavailable'
        : 'Active';

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

        {(() => {
          if (!(isDateFilterActive ? slipAvailableForRange : slipActive)) {
            return null;
          }

          const isHomeownerUser = currentUserType === 'homeowner';
          const homeownerStatus = (
            currentUser?.homeowner_status ||
            currentUser?.homeownerStatus ||
            ''
          )
            .toString()
            .toLowerCase();
          const homeownerVerified = !isHomeownerUser || homeownerStatus === 'verified';

          if (homeownerVerified) {
            return (
          <button
            onClick={() => {
              setSelectedSlip(slip);
              setCurrentView('booking');
            }}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Book This Slip
          </button>
            );
          }

          return (
            <button
              type="button"
              disabled
              className="w-full bg-gray-300 text-gray-600 py-2 rounded cursor-not-allowed"
              title="Homeowner verification required before booking."
            >
              Verification Required
            </button>
          );
        })()}
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
          // Check if this might be a temp password - if so, show reset form
          // We'll check by trying to verify the temp password with the backend
          try {
            const checkResponse = await fetch(`${API_BASE_URL}/api/password-reset`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'check-temp-password',
                email: loginData.email,
                tempPassword: loginData.password
              }),
            });
            
            // If backend has a check endpoint, use it. Otherwise, just show error.
            // For now, we'll assume if login fails, user should try reset password form
            alert('Invalid email or password. If you received a temporary password, please use the "Reset Password" form.');
          } catch (checkError) {
            alert('Invalid email or password. Please try again.');
          }
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

      // Check if the password used is a temporary password
      // We'll check the users table to see if this password matches a temp password
      try {
        const checkTempResponse = await fetch(`${API_BASE_URL}/api/user-profile?email=${encodeURIComponent(loginData.email)}`);
        if (checkTempResponse.ok) {
          const userResult = await checkTempResponse.json();
          if (userResult.success && userResult.profile) {
            // Check if the password matches the stored temp password
            // Note: We can't directly check this from frontend, but we can try to detect
            // by checking if login succeeded but user has a temp password flag
            // For now, we'll let the login proceed and handle temp password in reset form
          }
        }
      } catch (checkError) {
        // Ignore check errors
      }

      if (authData.user) {
        console.log('AUTH DEBUG - Login successful, user:', authData.user);
        
        // Check if this is a temporary password by checking the users table
        try {
          const userCheckResponse = await fetch(`${API_BASE_URL}/api/user-profile?email=${encodeURIComponent(loginData.email)}`);
          if (userCheckResponse.ok) {
            const userCheckResult = await userCheckResponse.json();
            if (userCheckResult.success && userCheckResult.profile) {
              // Check if user has a temp password stored (in reset_token field)
              if (userCheckResult.profile.reset_token && 
                  userCheckResult.profile.reset_token_expires && 
                  new Date(userCheckResult.profile.reset_token_expires) > new Date()) {
                // This is a temp password - show reset form instead of logging in
                console.log('AUTH DEBUG - Temporary password detected, showing reset form');
                setTempEmail(loginData.email);
                setTempPassword(loginData.password);
                setAuthStep('reset-password');
                setLoginData({ email: loginData.email, password: '' });
                alert('⚠️ You are using a temporary password. Please set a new password to continue.');
                return;
              }
            }
          }
        } catch (checkError) {
          console.error('Error checking for temp password:', checkError);
          // Continue with normal login if check fails
        }
        
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
        console.log('AUTH DEBUG - Setting currentUser with profile:', {
          id: userProfile.id,
          email: userProfile.email,
          user_type: userProfile.user_type,
          homeowner_status: userProfile.homeowner_status || userProfile.homeownerStatus,
          dues: userProfile.dues,
          fullProfile: userProfile
        });
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
        updateUserBookingsFromList(bookings, userProfile);
        
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
      // Fetch profile from backend API (bypasses RLS) with timeout
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      try {
        const response = await fetch(`${localApiUrl}/api/user-profile?email=${encodeURIComponent(authUser.email)}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
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
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('AUTH DEBUG - Profile fetch timed out, using minimal user');
        } else {
          throw fetchError;
        }
        return null;
      }
      
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
      
      if (registerData.userType === 'homeowner') {
        if (!registerData.propertyAddress || !registerData.lotNumber) {
          alert('Homeowners must select their property address and enter the Lot number before continuing.');
          return;
        }

        // Validate that lot number contains only numbers
        const lotNumberTrimmed = registerData.lotNumber.trim();
        if (lotNumberTrimmed && !/^\d+$/.test(lotNumberTrimmed)) {
          alert('❌ Lot Number must contain only numbers. Please enter a valid Lot number.');
          return;
        }

        const normalizedAddress = registerData.propertyAddress.trim().toLowerCase();
        const normalizedLot = lotNumberTrimmed;

        if (propertyOwners.length) {
          const matchingOwner = propertyOwners.find(
            (owner) => (owner.property_address || '').trim().toLowerCase() === normalizedAddress
          );

          if (!matchingOwner) {
            alert('❌ The selected property address is not recognized.\n\nIf you believe this is an error or you don\'t remember your property details, please contact Dock82 support at support@dock82.com for assistance.');
            return;
          }

          const recordedLot = (matchingOwner.lot_number || '').trim();
          if (recordedLot && recordedLot !== normalizedLot) {
            alert('❌ The Lot number does not match our records.\n\nPlease double-check the Lot number or contact Dock82 support at support@dock82.com if you need help.');
            return;
          }

          const ownerEmail = (matchingOwner.email || '').trim().toLowerCase();
          const registeringEmail = registerData.email.trim().toLowerCase();

          if (!ownerEmail || ownerEmail.startsWith('no-email-')) {
            alert('⚠️ We do not have an email on file for this property.\n\nPlease contact Dock82 support at support@dock82.com so we can update your records and help you complete registration.');
            return;
          }

          if (ownerEmail !== registeringEmail) {
            alert('❌ The email you entered does not match the email associated with this property in our records.\n\nPlease use the email we have on file or contact Dock82 support at support@dock82.com for assistance.');
            return;
          }

          // Set homeowner status to pending verification for this specific owner record
          if (matchingOwner.id) {
            try {
              const response = await fetch(`${API_BASE_URL}/api/admin/users/${matchingOwner.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  homeownerStatus: 'pending_verification'
                })
              });

              if (!response.ok) {
                console.warn('AUTH DEBUG - Failed to set homeowner status to pending verification', await response.text());
              } else {
                // Optimistically update local state so admin view reflects change immediately
                setPropertyOwners((prev) =>
                  sortPropertyOwners(
                    prev.map((owner) =>
                      owner.id === matchingOwner.id
                        ? { ...owner, homeowner_status: 'pending_verification' }
                        : owner
                    )
                  )
                );
              }
            } catch (statusError) {
              console.warn('AUTH DEBUG - Error setting homeowner status to pending verification:', statusError);
            }
          }
        }
      }
      
      // Register user via our API endpoint (bypasses Supabase email rate limits)
      // Uses Admin API to create user and Resend for emails (same as booking receipts)
      console.log('AUTH DEBUG - Registering user via API (bypassing Supabase email rate limits)...');
      
      const localApiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const propertyAddressPayload = registerData.propertyAddress ? registerData.propertyAddress.trim() : '';
      const lotNumberPayload = registerData.lotNumber ? registerData.lotNumber.trim() : '';
      
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
            propertyAddress: propertyAddressPayload,
            lotNumber: lotNumberPayload
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
          setRegisterData({ email: '', password: '', name: '', phone: '', userType: 'renter', propertyAddress: '', parcelNumber: '', lotNumber: '', emergencyContact: '', confirmPassword: '' });
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
      if (authData?.emailSent) {
        console.log('AUTH DEBUG - Welcome email sent via Resend');
      } else if (authData && authData.emailSent === false) {
        console.warn('AUTH DEBUG - Welcome email was not sent:', authData.emailError || 'Unknown reason');
      }
      
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
          parcelNumber: '',
          lotNumber: '',
          emergencyContact: ''
        });
        setAuthStep('login');
        
        alert('✅ Registration successful!\n\n📧 A welcome email has been sent to ' + registerData.email + ' via Resend (check your spam folder if you don\'t see it).\n\nYou can now log in with your email and password.\n\nYour account information has been saved to the database.');
      } else {
        // Email already confirmed - log them in immediately
        console.log('AUTH DEBUG - Email already confirmed, logging in');
        const normalizedUserType = normalizeUserType(
          userProfile.user_type || userProfile.userType || userProfile.user_role
        );
        const normalizedUserProfile =
          normalizedUserType === 'homeowner'
            ? {
                ...userProfile,
                homeowner_status:
                  userProfile.homeowner_status ||
                  userProfile.homeownerStatus ||
                  'pending_verification',
                homeowner_verified_at:
                  userProfile.homeowner_verified_at || userProfile.homeownerVerifiedAt || null
              }
            : userProfile;

        setCurrentUser(normalizedUserProfile);
        setShowLoginModal(false);
        setRegisterData({ 
          name: '', 
          email: '', 
          password: '', 
          confirmPassword: '',
          phone: '',
          userType: 'renter',
          propertyAddress: '',
          parcelNumber: '',
          lotNumber: '',
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
    // Clear local state first (this is what matters for the UI)
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
    setNotifications([]);
    
    // Try to sign out from Supabase (but don't block on errors)
    // If session is already missing or expired, that's fine - we've already cleared local state
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      // Only log non-critical errors (session missing is expected if already logged out)
      if (error && !error.message?.includes('session missing') && !error.message?.includes('Auth session missing')) {
        console.warn('AUTH DEBUG - Non-critical error during signOut (local state already cleared):', error.message);
      }
    } catch (error) {
      // Ignore errors - local state is already cleared, so logout is effectively complete
      // Session missing errors are harmless and can be ignored
      if (!error.message?.includes('session missing') && !error.message?.includes('Auth session missing')) {
        console.warn('AUTH DEBUG - Error during signOut (local state already cleared):', error.message);
      }
    }
    
    console.log('AUTH DEBUG - Logout complete (local state cleared)');
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

  const handleCreateAdmin = async (event) => {
    event.preventDefault();

    const errors = {};
    const nameValue = (newAdminData.name || '').trim();
    const emailValue = (newAdminData.email || '').trim();
    const userTypeValue = normalizeUserType(newAdminData.userType || 'admin');

    if (!nameValue) {
      errors.name = 'Name is required';
    }
    if (!emailValue) {
      errors.email = 'Email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailValue)) {
        errors.email = 'Please enter a valid email address';
      }
    }
    if (!userTypeValue) {
      errors.userType = 'Role is required';
    }

    if (Object.keys(errors).length > 0) {
      setNewAdminErrors(errors);
      return;
    }

    setAdminSubmitting(true);
    setNewAdminErrors({});

    const payload = {
      email: emailValue.toLowerCase(),
      name: nameValue,
      phone: (newAdminData.phone || '').trim(),
      userType: userTypeValue,
      autoGeneratePassword: true // Flag to tell backend to auto-generate temp password
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/register-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.details || result?.error || 'Failed to create admin');
      }

      // If we received a user object, add it optimistically
      if (result?.user && result.user.user_type && ['admin', 'superadmin'].includes(normalizeUserType(result.user.user_type))) {
        const newAdmin = {
          ...result.user,
          id: result.user.id || result.user.user?.id,
          name: result.user.name || result.user.user?.name || newAdminData.name,
          email: result.user.email || result.user.user?.email || newAdminData.email,
          phone: result.user.phone || result.user.user?.phone || newAdminData.phone || '',
          user_type: normalizeUserType(result.user.user_type || result.user.user?.user_type || newAdminData.userType)
        };
        setAllAdmins((prev) => sortAdmins([...prev, newAdmin]));
      }

      // Wait a moment for database to sync, then refresh admin list to ensure consistency
      await new Promise(resolve => setTimeout(resolve, 800));
      await loadAllAdmins();
      await loadAllUsers();
      resetNewAdminForm();
      alert('✅ Admin created successfully!\n\n📧 A temporary password has been sent to their email address. They will be prompted to change it on first login.');
    } catch (error) {
      console.error('Error creating admin:', error);
      setNewAdminErrors((prev) => ({
        ...prev,
        general: error.message || 'Failed to create admin. Please try again.'
      }));
    } finally {
      setAdminSubmitting(false);
    }
  };
  const handleSaveAdmin = async () => {
    if (!editingAdmin) {
      return;
    }

    const errors = {};
    const nameValue = (editingAdmin.name || '').trim();
    const emailValue = (editingAdmin.email || '').trim();
    const phoneValue = (editingAdmin.phone || '').trim();

    if (!nameValue) {
      errors.name = 'Name is required';
    }
    if (!emailValue) {
      errors.email = 'Email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailValue)) {
        errors.email = 'Please enter a valid email address';
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditingAdminErrors(errors);
      return;
    }

    setAdminSaving(true);
    setEditingAdminErrors({});

    const payload = {
      name: nameValue,
      email: emailValue.toLowerCase(),
      phone: phoneValue || null
      // userType is not included - it should remain unchanged
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${editingAdmin.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.details || result?.error || 'Failed to update admin');
      }

      const updatedAdmin = result.user;
      const updatedType = normalizeUserType(
        updatedAdmin.user_type || updatedAdmin.userType || updatedAdmin.user_role
      );

      setAllAdmins((prev) => {
        const updatedList = prev
          .map((admin) => (admin.id === updatedAdmin.id ? updatedAdmin : admin))
          .filter((admin) => {
            const type = normalizeUserType(admin.user_type || admin.userType || admin.user_role);
            return type === 'admin' || type === 'superadmin';
          });
        return sortAdmins(updatedList);
      });

      await loadAllUsers();
      if (updatedType !== 'admin' && updatedType !== 'superadmin') {
        await fetchHomeownerRecords();
      }

      handleCloseAdminModal();
      alert('✅ Admin updated successfully!');
    } catch (error) {
      console.error('Error updating admin:', error);
      setEditingAdminErrors((prev) => ({
        ...prev,
        general: error.message || 'Failed to update admin. Please try again.'
      }));
    } finally {
      setAdminSaving(false);
    }
  };
  const handleDeleteAdmin = useCallback(
    async (admin) => {
      if (!admin?.id) {
        alert('Unable to delete admin: missing identifier.');
        return;
      }

      if (currentUser?.id && admin.id === currentUser.id) {
        alert('You cannot remove your own admin account while logged in.');
        return;
      }

      const confirmDelete = window.confirm(
        `Remove admin "${admin.name || admin.email || admin.id}"?\n\nThis will revoke their admin access.`
      );

      if (!confirmDelete) {
        return;
      }

      setAdminDeletingId(admin.id);
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${admin.id}`, {
          method: 'DELETE'
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) {
          throw new Error(result?.details || result?.error || 'Failed to remove admin');
        }

        setAllAdmins((prev) => prev.filter((existing) => existing.id !== admin.id));
        await loadAllUsers();
        await fetchHomeownerRecords();
        alert('✅ Admin removed successfully!');
      } catch (error) {
        console.error('Error deleting admin:', error);
        alert(error.message || '❌ Failed to remove admin. Please try again.');
      } finally {
        setAdminDeletingId(null);
      }
    },
    [API_BASE_URL, currentUser?.id, fetchHomeownerRecords, loadAllUsers]
  );

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

  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) {
      alert('You must be logged in to send notifications.');
      return;
    }
    if (!notificationForm.title.trim() || !notificationForm.message.trim()) {
      alert('Please provide both a title and message for the notification.');
      return;
    }
    if (notificationForm.recipientIds.length === 0) {
      alert('Please select at least one recipient.');
      return;
    }

    setNotificationSending(true);
    setNotificationFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: notificationForm.title.trim(),
          message: notificationForm.message.trim(),
          recipientIds: notificationForm.recipientIds,
          createdBy: currentUser.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send notifications');
      }

      const result = await response.json();
      setNotificationFeedback('Notification sent successfully!');
      setNotificationForm({
        title: '',
        message: '',
        recipientIds: []
      });

      if (notificationForm.recipientIds.includes(currentUser.id)) {
        fetchNotifications(currentUser.id);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      setNotificationFeedback(error.message || 'Failed to send notification.');
    } finally {
      setNotificationSending(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    
    if (!tempEmail) {
      alert('Please enter your email address.');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/password-reset`, {
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
          alert(`✅ Password reset email sent!\n\nPlease check your inbox (${tempEmail}) for instructions to reset your password.\n\nIf you don't see the email, please check your spam folder.`);
          // Don't set reset token - user will use the link from email
          // If they need to manually enter token (for testing), they can use the resetUrl if provided
          if (result.resetUrl) {
            // For testing: extract token from URL if needed
            const tokenMatch = result.resetUrl.match(/token=([^&]+)/);
            if (tokenMatch) {
              setResetToken(decodeURIComponent(tokenMatch[1]));
            }
          }
          // Don't automatically go to reset-password step - user should use email link
          // setAuthStep('reset-password');
        } else {
          alert(result.error || 'Failed to send password reset email');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to send password reset email' }));
        throw new Error(errorData.error || 'Failed to send password reset email');
      }
    } catch (error) {
      console.error('Error generating reset token:', error);
      alert('❌ Failed to generate reset token. Please try again.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!tempEmail || !tempPassword || !newPassword || !confirmNewPassword) {
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
      const response = await fetch(`${API_BASE_URL}/api/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reset-password',
          email: tempEmail,
          tempPassword: tempPassword,
          newPassword: newPassword,
          confirmPassword: confirmNewPassword
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Password reset successful - now log in with new password
          const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
            email: tempEmail,
            password: newPassword
          });
          
          if (loginError) {
            console.error('Error logging in after password reset:', loginError);
            alert('✅ Password reset successfully! Please log in with your new password.');
            setAuthStep('login');
            setLoginData({ email: tempEmail, password: '' });
          } else {
            // Successfully logged in
            const userProfile = await ensureUserProfile(authData.user);
            if (userProfile) {
              setCurrentUser(userProfile);
              if (userProfile.user_type === 'admin' || userProfile.user_type === 'superadmin') {
                setAdminMode(true);
                if (userProfile.user_type === 'superadmin') {
                  setSuperAdminMode(true);
                }
              }
            }
            setShowLoginModal(false);
            setAuthStep('login');
            alert('✅ Password reset successfully! You have been logged in.');
          }
          
          // Clear form and clean URL
          setTempEmail('');
          setTempPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
          
          // Clean temp-password from URL now that reset is complete
          if (window.location.search.includes('temp-password=true')) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } else {
          alert(result.error || 'Failed to reset password');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to reset password' }));
        throw new Error(errorData.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert(`❌ Failed to reset password: ${error.message || 'Please try again.'}`);
    }
  };



  const resetAuthFlow = () => {
    // Don't reset authStep if we're in temp-password mode
    const urlParams = new URLSearchParams(window.location.search);
    const isTempPasswordMode = urlParams.get('temp-password') === 'true';
    if (!isTempPasswordMode && authStep !== 'reset-password') {
      setAuthStep('login');
    }
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

  // Function to toggle slip availability
  const handleToggleSlipAvailability = async (slip) => {
    try {
      const nextAvailable = !slip.available;
      const payload = { available: nextAvailable };
      const updatedSlip = await patchSlip(slip.id, payload);
      applySlipUpdate(updatedSlip || { ...slip, available: nextAvailable });
      alert(`✅ ${slip.name} ${nextAvailable ? 'activated' : 'deactivated'} successfully!`);
    } catch (error) {
      console.error('Error updating slip availability:', error);
      alert(`❌ Failed to update slip availability. ${error.message || 'Please try again.'}`);
    }
  };

  const resetNewSlipForm = () => {
    if (newSlipImagePreview) {
      URL.revokeObjectURL(newSlipImagePreview);
    }
    setNewSlipImagePreview(null);
    setNewSlipForm({
      name: '',
      description: '',
      pricePerNight: '',
      maxBoatLength: '',
      width: '',
      depth: '',
      amenities: '',
      dockEtiquette: '',
      locationSection: '',
      locationPosition: '',
      locationLat: '',
      locationLng: '',
      imageFile: null
    });
    setNewSlipFormErrors({});
  };

  const handleNewSlipInputChange = (field, value) => {
    setNewSlipForm((prev) => ({
      ...prev,
      [field]: value
    }));
    setNewSlipFormErrors((prev) => ({
      ...prev,
      [field]: null
    }));
  };

  const handleNewSlipImageSelection = (event) => {
    const file = event.target?.files?.[0] || null;

    if (newSlipImagePreview) {
      URL.revokeObjectURL(newSlipImagePreview);
    }

    if (!file) {
      setNewSlipForm((prev) => ({ ...prev, imageFile: null }));
      setNewSlipImagePreview(null);
      setNewSlipFormErrors((prev) => ({ ...prev, image: null }));
      event.target.value = '';
      return;
    }

    const validation = validateFile(file, ['image/jpeg', 'image/png', 'image/webp'], 10);
    if (!validation.valid) {
      setNewSlipFormErrors((prev) => ({ ...prev, image: validation.error }));
      setNewSlipForm((prev) => ({ ...prev, imageFile: null }));
      setNewSlipImagePreview(null);
      event.target.value = '';
      return;
    }

    setNewSlipForm((prev) => ({ ...prev, imageFile: file }));
    setNewSlipImagePreview(URL.createObjectURL(file));
    setNewSlipFormErrors((prev) => ({ ...prev, image: null }));
  };

  const handleSubmitNewSlipForm = async (event) => {
    event.preventDefault();

    if (!currentUser?.id) {
      alert('❌ You must be logged in as an admin to add a slip.');
      return;
    }

    const trimmedName = newSlipForm.name.trim();
    const trimmedDescription = newSlipForm.description.trim();
    const trimmedDockEtiquette = newSlipForm.dockEtiquette.trim();
    const trimmedAmenities = newSlipForm.amenities.trim();
    const errors = {};

    if (!trimmedName) {
      errors.name = 'Slip name is required.';
    }

    const price = parseFloat(newSlipForm.pricePerNight);
    if (Number.isNaN(price) || price < 0) {
      errors.pricePerNight = 'Enter a valid price (0 or higher).';
    }

    const parseOptionalNumber = (value) => {
      if (!value && value !== 0) return null;
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const maxBoatLengthValue = parseFloat(newSlipForm.maxBoatLength);
    if (Number.isNaN(maxBoatLengthValue) || maxBoatLengthValue <= 0) {
      errors.maxBoatLength = 'Enter a valid maximum boat length (ft).';
    }

    const widthValue = parseFloat(newSlipForm.width);
    if (Number.isNaN(widthValue) || widthValue <= 0) {
      errors.width = 'Enter a valid slip width (ft).';
    }

    const depthValue = parseFloat(newSlipForm.depth);
    if (Number.isNaN(depthValue) || depthValue <= 0) {
      errors.depth = 'Enter a valid slip depth (ft).';
    }

    const lat = parseOptionalNumber(newSlipForm.locationLat);
    if (newSlipForm.locationLat && lat === null) {
      errors.locationLat = 'Enter a valid latitude.';
    }

    const lng = parseOptionalNumber(newSlipForm.locationLng);
    if (newSlipForm.locationLng && lng === null) {
      errors.locationLng = 'Enter a valid longitude.';
    }

    if (Object.keys(errors).length > 0) {
      setNewSlipFormErrors(errors);
      return;
    }

    const amenitiesArray = trimmedAmenities
      ? trimmedAmenities.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

    const slipPayload = {
      name: trimmedName,
      description: trimmedDescription || null,
      price_per_night: price,
      max_boat_length: maxBoatLengthValue,
      width: widthValue,
      depth: depthValue,
      amenities: amenitiesArray,
      dock_etiquette: trimmedDockEtiquette || null,
      available: false,
      created_by: currentUser.id,
      images: []
    };

    const locationPayload = {};
    if (newSlipForm.locationSection.trim()) {
      locationPayload.section = newSlipForm.locationSection.trim();
    }
    if (newSlipForm.locationPosition.trim()) {
      const parsedPosition = parseOptionalNumber(newSlipForm.locationPosition);
      if (parsedPosition !== null) {
        locationPayload.position = parsedPosition;
      } else {
        setNewSlipFormErrors((prev) => ({
          ...prev,
          locationPosition: 'Enter a valid number for slip position.'
        }));
        return;
      }
    }
    if (lat !== null && lng !== null) {
      locationPayload.coordinates = { lat, lng };
    }
    if (Object.keys(locationPayload).length > 0) {
      slipPayload.location_data = locationPayload;
    }

    setNewSlipSubmitting(true);
    try {
      const inserted = await addSlips({ slipPayload });
      const createdSlip = inserted?.[0];

      if (createdSlip?.id && newSlipForm.imageFile) {
        const uploadResult = await uploadSlipImage(newSlipForm.imageFile, createdSlip.id);
        if (uploadResult.success && uploadResult.url) {
          try {
            const updatedSlip = await patchSlip(createdSlip.id, { images: [uploadResult.url] });
            if (updatedSlip) {
              applySlipUpdate(updatedSlip);
            }
          } catch (imageUpdateError) {
            console.error('Error saving slip image URL:', imageUpdateError);
          }
        } else if (uploadResult.error) {
          console.error('Image upload failed for new slip:', uploadResult.error);
          alert(`⚠️ Slip was created, but the image could not be uploaded: ${uploadResult.error}`);
        }
      }

      await refreshSlipsFromServer();
      resetNewSlipForm();
      alert('✅ Slip added successfully! It has been set to inactive by default.');
    } catch (error) {
      console.error('Error adding slip:', error);
      alert(`❌ Failed to add slip. ${error.message || 'Please try again.'}`);
    } finally {
      setNewSlipSubmitting(false);
    }
  };

  const handleAddDefaultSlips = async () => {
    setNewSlipSubmitting(true);
    try {
      await addSlips({ generateDefault: true });
      await refreshSlipsFromServer();
      alert('✅ Slips 13 & 14 added or updated successfully. They remain inactive until activated.');
    } catch (error) {
      console.error('Error adding default slips:', error);
      alert(`❌ Failed to add slips 13 & 14. ${error.message || 'Please try again.'}`);
    } finally {
      setNewSlipSubmitting(false);
    }
  };

  const handleShowEtiquetteModal = () => {
    setShowEtiquetteModal(true);
  };

  const handleEditUser = (userEmail) => {
    // First try to get user data from allUsers (users table)
    const user = allUsers.find(u => (u.email || '').toLowerCase().trim() === (userEmail || '').toLowerCase().trim());
    
    // Fallback to booking data if user not found
    const userBookings = bookings.filter(b => (b.guestEmail || '').toLowerCase().trim() === (userEmail || '').toLowerCase().trim());
    const latestBooking = userBookings.length > 0 ? userBookings[userBookings.length - 1] : null;
    
    setEditingUser({
      email: userEmail,
      name: user?.name || latestBooking?.guestName || userEmail?.split('@')[0] || '',
      phone: user?.phone || latestBooking?.guestPhone || '',
      userType: user ? normalizeUserType(user.user_type || user.userType || user.user_role) : (latestBooking?.userType || 'renter'),
      id: user?.id
    });
    setShowUserEditModal(true);
  };

  const handleSaveUser = async () => {
    if (editingUser) {
      if (!editingUser.id) {
        alert('❌ Cannot update user: User ID is missing. Please refresh the page and try again.');
        return;
      }
      
      try {
        // Save to database
        const response = await fetch(`${API_BASE_URL}/api/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update-user',
            userId: editingUser.id,
            userData: {
              name: editingUser.name,
              phone: editingUser.phone
              // userType is not included - it should remain unchanged
            }
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state - update allUsers
            setAllUsers(prevUsers => 
              prevUsers.map(user => 
                user.id === editingUser.id 
                  ? { ...user, name: editingUser.name, phone: editingUser.phone }
                  : user
              )
            );
            
            // Update bookings
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
            
            // Reload allUsers to ensure data is in sync
            await loadAllUsers();
            
            alert('✅ User updated successfully!');
          } else {
            alert('❌ Failed to update user: ' + result.error);
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Failed to update user' }));
          throw new Error(errorData.error || 'Failed to update user');
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
        const apiUrl = API_BASE_URL;
        // Delete from database using email-based endpoint
        const response = await fetch(`${apiUrl}/api/admin/users/email?email=${encodeURIComponent(userEmail)}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // Update local state - remove from allUsers
            setAllUsers(prevUsers => prevUsers.filter(user => (user.email || '').toLowerCase().trim() !== (userEmail || '').toLowerCase().trim()));
            
            // Update bookings
            const updatedBookings = bookings.filter(booking => (booking.guestEmail || '').toLowerCase().trim() !== (userEmail || '').toLowerCase().trim());
            setBookings(updatedBookings);
            
            // Reload allUsers to ensure data is in sync
            await loadAllUsers();
            
            alert('✅ User deleted successfully!');
          } else {
            const errorMsg = result.error || result.details || 'Unknown error';
            const suggestion = result.suggestion ? `\n\n${result.suggestion}` : '';
            alert(`❌ Failed to delete user: ${errorMsg}${suggestion}`);
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Failed to delete user' }));
          const errorMsg = errorData.error || errorData.details || 'Failed to delete user';
          const suggestion = errorData.suggestion ? `\n\n${errorData.suggestion}` : '';
          throw new Error(`${errorMsg}${suggestion}`);
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('❌ Failed to delete user: ' + (error.message || 'Please try again.'));
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



  const [showEtiquetteModal, setShowEtiquetteModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showUserEditModal, setShowUserEditModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [editingPropertyOwnerInfo, setEditingPropertyOwnerInfo] = useState(null);
  const [editingPropertyOwnerDates, setEditingPropertyOwnerDates] = useState(null);

  useEffect(() => {
    if (currentUser?.id) {
      setDataInitialized(false);
    }
  }, [currentUser?.id]);

  // Load data from API on component mount - only if authenticated
  useEffect(() => {
    // If session is still loading, wait
    if (sessionLoading) {
      return;
    }
    
    // If user is not authenticated, set loading to false and return
    if (!currentUser) {
      setSlipsLoading(false);
      setDataInitialized(false);
      return;
    }
    
    if (dataInitialized) {
      return;
    }
    
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
        setDataInitialized(true);
        setSlipsLoading(false);
      }
    };
    
    // Only load data if user is authenticated
    if (currentUser) {
    loadData();
    } else {
      setSlipsLoading(false);
    }
  }, [currentUser, sessionLoading, dataInitialized]);


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
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  setShowLoginModal(true);
                  resetAuthFlow();
                } else {
                  setCurrentView('browse');
                }
              }}
              className="flex items-center bg-transparent border-none p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-md"
            >
              <Dock82Logo width={52} height={52} includeText variant="full" />
            </button>
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
                📧 Notifications {unreadNotificationsCount > 0 && (
                  <span className="bg-red-500 text-white rounded-full px-2 py-1 text-xs ml-1">
                    {unreadNotificationsCount}
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
        {/* Dues Payment Banner for Inactive Homeowners */}
        {(() => {
          const isHomeowner = currentUser && normalizeUserType(currentUser.user_type || currentUser.userType) === 'homeowner';
          const homeownerStatus = (currentUser?.homeowner_status || currentUser?.homeownerStatus || '').toString().toLowerCase();
          const isInactive = homeownerStatus === 'inactive_owner';
          const hasDues = currentUser?.dues && parseFloat(currentUser.dues) > 0;
          
          // Debug logging
          if (isHomeowner && isInactive) {
            console.log('Dues Banner Check:', {
              isHomeowner,
              homeownerStatus,
              isInactive,
              dues: currentUser.dues,
              hasDues,
              currentUser: currentUser
            });
          }
          
          return isHomeowner && isInactive && hasDues;
        })() && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-red-500 text-2xl">⚠️</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-red-800">
                      Account Inactive - Outstanding Dues
                    </h3>
                    <p className="text-sm text-red-700 mt-1">
                      Your account is inactive. Please pay your outstanding dues of <strong>${parseFloat(currentUser.dues).toFixed(2)}</strong> to reactivate your account and resume booking dock slips.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDuesPayment(true)}
                  disabled={duesPaymentProcessing}
                  className={`ml-4 px-6 py-2 rounded-md text-white font-medium ${
                    duesPaymentProcessing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {duesPaymentProcessing ? 'Processing...' : 'Pay Dues Now'}
                </button>
              </div>
            </div>
          )}

        {showDuesPayment ? (
          <PaymentPage
            bookingData={{
              guestName: currentUser?.name || '',
              guestEmail: currentUser?.email || '',
              guestPhone: currentUser?.phone || '',
              userType: 'homeowner'
            }}
            selectedSlip={{
              name: 'Dues Payment',
              price_per_night: currentUser?.dues || 0
            }}
            onPaymentComplete={handleDuesPayment}
            onBack={() => setShowDuesPayment(false)}
            isDuesPayment={true}
          />
        ) : showPaymentPage ? (
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
                Filter by Date Range
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
                  {isPaymentExempt(bookingData.userType)
                    ? `${formatUserTypeLabel(bookingData.userType)} booking (no nightly charge)`
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
              {isPaymentExempt(bookingData.userType) && (
                <div className="bg-red-100 p-4 rounded-lg border-2 border-red-300">
                  <h3 className="text-lg font-semibold text-red-900 mb-3">🚨 Recommended Document</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">🛡️ Proof of Boat Insurance</label>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.png"
                      onChange={(e) => setBookingData({...bookingData, homeownerInsuranceProof: e.target.files[0]})}
                      className="w-full border-2 border-blue-500 rounded-md px-3 py-3 bg-blue-50"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Optionally upload proof of boat insurance for additional verification.
                    </p>
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
                          <p className="text-sm text-gray-500">
                            Payment: {getPaymentStatusLabel(booking.paymentStatus)}
                          </p>
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
        {currentView === 'notifications' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
                <p className="text-sm text-gray-600">
                  Stay up to date with Dock82 announcements and important updates.
                </p>
              </div>
              {adminMode && (
                <button
                  onClick={() => {
                    if (allUsers.length === 0) {
                      loadAllUsers();
                    }
                  }}
                  className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Refresh recipient list
                </button>
              )}
            </div>

            {adminMode && (
              <div className="mb-8 border border-blue-100 rounded-lg p-6 bg-blue-50/40">
                <h3 className="text-lg font-semibold text-blue-900 mb-4">Send Notification</h3>
                <form onSubmit={handleSendNotification} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={notificationForm.title}
                      onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Maintenance update, Dock closure, etc."
                      maxLength={120}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message
                    </label>
                    <textarea
                      value={notificationForm.message}
                      onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={4}
                      placeholder="Share important details for selected members."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Recipients
                    </label>
                    <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md divide-y divide-gray-200">
                      {allUsers.map((user) => {
                        const isChecked = notificationForm.recipientIds.includes(user.id);
                        return (
                          <label
                            key={user.id}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                          >
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                checked={isChecked}
                                onChange={(e) => {
                                  setNotificationForm((prev) => {
                                    const nextRecipients = e.target.checked
                                      ? [...prev.recipientIds, user.id]
                                      : prev.recipientIds.filter((id) => id !== user.id);
                                    return { ...prev, recipientIds: nextRecipients };
                                  });
                                }}
                              />
                              <div>
                                <p className="text-sm font-medium text-gray-800">
                                  {user.name || user.email}
                                </p>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">
                                  {user.user_type || 'renter'}
                                </p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                      {allUsers.length === 0 && (
                        <div className="px-3 py-4 text-sm text-gray-500 text-center">
                          No users available.
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                      <div>
                        <span className="font-semibold">
                          {notificationForm.recipientIds.length}
                        </span>{' '}
                        recipient
                        {notificationForm.recipientIds.length === 1 ? '' : 's'} selected
                      </div>
                      <div className="space-x-2">
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => {
                            setNotificationForm((prev) => ({
                              ...prev,
                              recipientIds:
                                prev.recipientIds.length === allUsers.length
                                  ? []
                                  : allUsers.map((user) => user.id)
                            }));
                          }}
                        >
                          {notificationForm.recipientIds.length === allUsers.length
                            ? 'Clear all'
                            : 'Select all'}
                        </button>
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() =>
                            setNotificationForm((prev) => ({
                              ...prev,
                              recipientIds: []
                            }))
                          }
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                  {notificationFeedback && (
                    <div
                      className={`p-3 rounded ${
                        notificationFeedback.includes('success')
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {notificationFeedback}
                    </div>
                  )}
                  <div className="flex items-center justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationForm({ title: '', message: '', recipientIds: [] });
                        setNotificationFeedback(null);
                      }}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      disabled={notificationSending}
                      className={`px-4 py-2 rounded-md text-white text-sm font-medium ${
                        notificationSending ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {notificationSending ? 'Sending...' : 'Send Notification'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Inbox</h3>
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-10 text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
                  <p>No notifications yet. We will post important updates here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                        expandedNotificationId === notification.id
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => toggleNotificationExpansion(notification)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            {notification.title || 'Notification'}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {notification.readAt ? 'Viewed' : 'New'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500">
                            {formatDateTime(notification.createdAt)}
                          </span>
                          <div className="text-xs text-gray-400 mt-1">
                            from {notification.createdBy === currentUser?.id ? 'You' : 'Dock82 Admin'}
                          </div>
                        </div>
                      </div>
                      {expandedNotificationId === notification.id && (
                        <div className="mt-3 border-t border-blue-100 pt-3">
                          <p className="text-sm text-gray-700 whitespace-pre-line">
                            {notification.message}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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
                <details className="bg-blue-50 rounded-lg mb-6">
                  <summary className="flex items-center justify-between cursor-pointer px-4 py-3">
                    <span className="font-semibold text-blue-800">Add New Slip</span>
                    <span className="text-sm text-blue-700">Expand to create a slip</span>
                  </summary>
                  <div className="px-4 pb-4">
                    <p className="text-sm text-blue-700 mb-4">
                      Create a brand-new slip with custom details. Each slip is created as inactive so you can review it before showing it on the site.
                    </p>

                    <form onSubmit={handleSubmitNewSlipForm} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Slip Name<span className="text-red-600">*</span></label>
                        <input
                          type="text"
                          value={newSlipForm.name}
                          onChange={(e) => handleNewSlipInputChange('name', e.target.value)}
                          className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.name ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="e.g. Slip 15"
                        />
                        {newSlipFormErrors.name && (
                          <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.name}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Price per Night (USD)<span className="text-red-600">*</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newSlipForm.pricePerNight}
                          onChange={(e) => handleNewSlipInputChange('pricePerNight', e.target.value)}
                          className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.pricePerNight ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="e.g. 75"
                        />
                        {newSlipFormErrors.pricePerNight && (
                          <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.pricePerNight}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Max Boat Length (ft)<span className="text-red-600">*</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={newSlipForm.maxBoatLength}
                          onChange={(e) => handleNewSlipInputChange('maxBoatLength', e.target.value)}
                          className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.maxBoatLength ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="e.g. 30"
                          required
                        />
                        {newSlipFormErrors.maxBoatLength && (
                          <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.maxBoatLength}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Slip Width (ft)<span className="text-red-600">*</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={newSlipForm.width}
                          onChange={(e) => handleNewSlipInputChange('width', e.target.value)}
                          className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.width ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="e.g. 12"
                          required
                        />
                        {newSlipFormErrors.width && (
                          <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.width}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Slip Depth (ft)<span className="text-red-600">*</span></label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={newSlipForm.depth}
                          onChange={(e) => handleNewSlipInputChange('depth', e.target.value)}
                          className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.depth ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="e.g. 6"
                          required
                        />
                        {newSlipFormErrors.depth && (
                          <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.depth}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Slip Position</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={newSlipForm.locationPosition}
                          onChange={(e) => handleNewSlipInputChange('locationPosition', e.target.value)}
                          className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.locationPosition ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="e.g. 15"
                        />
                        {newSlipFormErrors.locationPosition && (
                          <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.locationPosition}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Dock Section</label>
                        <input
                          type="text"
                          value={newSlipForm.locationSection}
                          onChange={(e) => handleNewSlipInputChange('locationSection', e.target.value)}
                          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          placeholder="e.g. D"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Latitude</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={newSlipForm.locationLat}
                            onChange={(e) => handleNewSlipInputChange('locationLat', e.target.value)}
                            className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.locationLat ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="26.3614"
                          />
                          {newSlipFormErrors.locationLat && (
                            <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.locationLat}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Longitude</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={newSlipForm.locationLng}
                            onChange={(e) => handleNewSlipInputChange('locationLng', e.target.value)}
                            className={`mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${newSlipFormErrors.locationLng ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="-80.0833"
                          />
                          {newSlipFormErrors.locationLng && (
                            <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.locationLng}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <textarea
                        value={newSlipForm.description}
                        onChange={(e) => handleNewSlipInputChange('description', e.target.value)}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        rows="3"
                        placeholder="Describe the slip, including utility info or special notes."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Amenities</label>
                      <input
                        type="text"
                        value={newSlipForm.amenities}
                        onChange={(e) => handleNewSlipInputChange('amenities', e.target.value)}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="e.g. Water, Electric (120V)"
                      />
                      <p className="mt-1 text-xs text-gray-500">Separate amenities with commas.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Dock Etiquette</label>
                      <textarea
                        value={newSlipForm.dockEtiquette}
                        onChange={(e) => handleNewSlipInputChange('dockEtiquette', e.target.value)}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        rows="3"
                        placeholder="Optional: add slip-specific etiquette notes."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Slip Image</label>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleNewSlipImageSelection}
                        className="mt-1 w-full text-sm text-gray-600"
                      />
                      {newSlipFormErrors.image && (
                        <p className="mt-1 text-xs text-red-600">{newSlipFormErrors.image}</p>
                      )}
                      {newSlipImagePreview && (
                        <div className="mt-2">
                          <img
                            src={newSlipImagePreview}
                            alt="Slip preview"
                            className="h-24 w-24 rounded object-cover shadow"
                          />
                  <button
                            type="button"
                            className="mt-2 text-xs text-red-600 underline"
                            onClick={() => {
                              if (newSlipImagePreview) {
                                URL.revokeObjectURL(newSlipImagePreview);
                              }
                              setNewSlipImagePreview(null);
                              setNewSlipForm((prev) => ({ ...prev, imageFile: null }));
                              if (newSlipFormErrors.image) {
                                setNewSlipFormErrors((prev) => ({ ...prev, image: null }));
                              }
                            }}
                          >
                            Remove image
                  </button>
                        </div>
                      )}
                </div>

                      <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:bg-blue-300"
                        disabled={newSlipSubmitting}
                      >
                        {newSlipSubmitting ? 'Adding Slip...' : 'Add Slip & Keep Inactive'}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
                        onClick={resetNewSlipForm}
                        disabled={newSlipSubmitting}
                      >
                        Clear Form
                      </button>
                    </div>
                    <p className="text-xs text-blue-600">
                      Each new slip is created with status <span className="font-semibold">inactive</span>. Activate it from the list below when it&rsquo;s ready to be shown on the site.
                    </p>
                    </form>
                  </div>
                </details>

                {/*
                <div className="bg-green-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-green-800 mb-2">Slip Availability Control</h4>
                  <p className="text-sm text-green-700 mb-3">
                    Activate or deactivate slips. Deactivated slips will not appear in the booking interface.
                  </p>
                </div>
                */}
                
                {/* Slip Descriptions and Pricing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {slips.map(slip => (
                    <div key={slip.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">{slip.name}</h4>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs ${slip.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {slip.available ? 'Active' : 'Inactive'}
                          </span>
                        <button
                          onClick={() => handleToggleSlipAvailability(slip)}
                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                            slip.available 
                              ? 'bg-red-600 text-white hover:bg-red-700' 
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {slip.available ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
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
                        
                        return imageSrc && (!editingSlip || editingSlip.id !== slip.id || editingSlip.editingType !== 'image') ? (
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

                      {editingSlip?.id === slip.id && editingSlip.editingType === 'image' ? (
                        <div className="mt-3 space-y-2">
                          {editingImage ? (
                            <div>
                              <img
                                src={editingImage}
                                alt={`${slip.name} preview`}
                                className="w-full h-24 object-cover rounded border"
                              />
                  </div>
                          ) : null}
                          <input
                            key={`slip-image-input-${slip.id}`}
                            type="file"
                            accept="image/*"
                            onChange={handleImageFileChange}
                            className="block w-full text-sm text-gray-600"
                          />
                          {imageUploadError && (
                            <p className="text-xs text-red-600">{imageUploadError}</p>
                          )}
                            <div className="flex space-x-2">
                              <button
                              onClick={handleSaveImage}
                              disabled={isUploading}
                              className={`px-3 py-1 rounded text-sm text-white ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'}`}
                              >
                              {isUploading ? 'Saving...' : 'Save Image'}
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
                        <div className="mt-2">
                            <button
                            onClick={() => handleStartImageEdit(slip)}
                            className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
                            >
                            {slip.images && slip.images.length ? 'Change Image' : 'Add Image'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                {/* Dock Etiquette Management */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Dock Etiquette Management</h3>
                  
                  <div className="bg-blue-50 p-4 rounded-lg mb-6">
                    <h4 className="font-semibold text-blue-800 mb-2">About Dock Etiquette</h4>
                    <p className="text-sm text-blue-700">
                      Set and manage dock etiquette rules for all slips. These rules help ensure proper marina behavior 
                      and create a respectful environment for all users. Renters will see these rules during booking.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="text-sm font-medium text-blue-800 mr-1">Quick Etiquette Templates:</span>
                        <button
                          onClick={() => {
                            const standardRules = "• Respect quiet hours (10 PM - 7 AM)\n• Keep slip area clean and organized\n• Follow all safety protocols\n• Notify management of any issues\n• No loud music or parties\n• Proper waste disposal required";
                          setCommonEtiquette(standardRules);
                          }}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                        >
                        Standard
                        </button>
                        <button
                          onClick={() => {
                            const familyRules = "• Family-friendly environment\n• Respect quiet hours (9 PM - 8 AM)\n• Supervise children at all times\n• Keep slip area clean and organized\n• Follow all safety protocols\n• No pets without permission\n• Proper waste disposal required";
                          setCommonEtiquette(familyRules);
                          }}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                        >
                        Family-Friendly
                      </button>
                      <button
                        onClick={() => {
                          const premiumRules = "• Respect quiet hours (10 PM - 7 AM)\n• Professional conduct required at all times\n• No outside contractors without approval\n• Report maintenance issues immediately\n• Keep dock clear of personal items\n• Proper waste and recycling disposal required";
                          setCommonEtiquette(premiumRules);
                        }}
                        className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200"
                      >
                        Premium
                        </button>
                      </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Dock Etiquette Rules</label>
                      <textarea
                        value={commonEtiquette}
                        onChange={(e) => setCommonEtiquette(e.target.value)}
                        placeholder="Enter dock etiquette rules..."
                        className="w-full p-2 border rounded text-sm"
                        rows="6"
                      />
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={handleSaveCommonEtiquette}
                        disabled={etiquetteSaving}
                        className={`px-3 py-1 text-sm text-white rounded ${etiquetteSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                        {etiquetteSaving ? 'Saving...' : 'Save Rules'}
                      </button>
                      <button
                        onClick={() => setCommonEtiquette('')}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                      >
                        Clear
                      </button>
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

                {superAdminMode && (
                  <section className="mb-8" aria-labelledby="admin-management-heading">
                    <h4
                      id="admin-management-heading"
                      className="text-lg font-semibold mb-2 flex items-center"
                    >
                      👑 Admins ({allAdmins.length})
                      <span className="ml-2 text-sm text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                        Superadmin Only
                      </span>
                    </h4>
                    <p className="text-sm text-purple-700 mb-4">
                      Create, update, or remove admin accounts. These controls are hidden from standard admins.
                    </p>

                    <details className="bg-white rounded-lg shadow mb-6 border border-purple-100">
                      <summary className="px-6 py-4 cursor-pointer text-purple-800 font-semibold flex items-center justify-between">
                        <span>Create New Admin</span>
                        <span className="text-sm font-normal text-purple-600">(click to expand)</span>
                      </summary>
                      <div className="px-6 pb-6 pt-2 space-y-4">
                        {newAdminErrors.general && (
                          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                            {newAdminErrors.general}
                          </div>
                        )}
                        <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                            <input
                              type="text"
                              value={newAdminData.name}
                              onChange={(e) => handleNewAdminInput('name', e.target.value)}
                              className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                                newAdminErrors.name ? 'border-red-500' : 'border-gray-300'
                              }`}
                              placeholder="Admin name"
                            />
                            {newAdminErrors.name && (
                              <p className="text-xs text-red-600 mt-1">{newAdminErrors.name}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                              type="email"
                              value={newAdminData.email}
                              onChange={(e) => handleNewAdminInput('email', e.target.value)}
                              className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                                newAdminErrors.email ? 'border-red-500' : 'border-gray-300'
                              }`}
                              placeholder="admin@example.com"
                            />
                            {newAdminErrors.email && (
                              <p className="text-xs text-red-600 mt-1">{newAdminErrors.email}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                            <input
                              type="text"
                              value={newAdminData.phone}
                              onChange={(e) => handleNewAdminInput('phone', e.target.value)}
                              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              placeholder="(555) 123-4567"
                            />
                          </div>


                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                            <select
                              value={newAdminData.userType}
                              onChange={(e) => handleNewAdminInput('userType', e.target.value)}
                              className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                                newAdminErrors.userType ? 'border-red-500' : 'border-gray-300'
                              }`}
                            >
                              <option value="admin">Admin</option>
                              <option value="superadmin">Superadmin</option>
                            </select>
                            {newAdminErrors.userType && (
                              <p className="text-xs text-red-600 mt-1">{newAdminErrors.userType}</p>
                            )}
                          </div>

                          <div className="md:col-span-2 flex items-center justify-end space-x-3 pt-2">
                            <button
                              type="button"
                              onClick={resetNewAdminForm}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                              disabled={adminSubmitting}
                            >
                              Clear
                            </button>
                            <button
                              type="submit"
                              disabled={adminSubmitting}
                              className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                                adminSubmitting ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                              }`}
                            >
                              {adminSubmitting ? 'Creating...' : 'Create Admin'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </details>

                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Email
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Phone
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Role
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {allAdmins.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-6 py-4 text-sm text-gray-500 text-center">
                                  No admins found. Use the form above to create one.
                                </td>
                              </tr>
                            )}
                            {allAdmins.map((admin) => {
                              const normalizedRole = normalizeUserType(
                                admin.user_type || admin.userType || admin.user_role
                              );
                              const isSuperadmin = normalizedRole === 'superadmin';

                              return (
                                <tr key={admin.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {admin.name || admin.email || 'Unnamed Admin'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {admin.email || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {admin.phone || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span
                                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        isSuperadmin
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}
                                    >
                                      {formatUserTypeLabel(normalizedRole)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 space-x-2">
                                    <button
                                      onClick={() => handleEditAdmin(admin)}
                                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    >
                                      ✏ Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteAdmin(admin)}
                                      disabled={adminDeletingId === admin.id}
                                      className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white ${
                                        adminDeletingId === admin.id
                                          ? 'bg-red-300 cursor-not-allowed'
                                          : 'bg-red-600 hover:bg-red-700'
                                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500`}
                                    >
                                      🗑 {adminDeletingId === admin.id ? 'Removing...' : 'Remove'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                )}

                {/* Property Owners Section */}
                <div className="mb-8">
                  <h4 className="text-lg font-semibold mb-4 flex items-center">
                    🏠 Property Owners ({propertyOwners.length})
                    {adminMode && (
                      <span className="ml-2 text-sm text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                        👑 Admin Access
                      </span>
                    )}
                  </h4>
                {pendingPropertyOwnersCount > 0 && (
                  <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                    Pending verification owners ({pendingPropertyOwnersCount}) are highlighted at the top for review.
                  </div>
                )}
                  {adminMode && (
                    <details className="bg-white rounded-lg shadow mb-6 border border-blue-100">
                      <summary className="px-6 py-4 cursor-pointer text-blue-800 font-semibold flex items-center justify-between">
                        <span>Add New Property Owner</span>
                        <span className="text-sm font-normal text-blue-600">(click to expand)</span>
                      </summary>
                      <div className="px-6 pb-6 pt-2 space-y-4">
                        {newPropertyOwnerErrors.general && (
                          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                            {newPropertyOwnerErrors.general}
                          </div>
                        )}
                        <form onSubmit={handleCreatePropertyOwner} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                          <input
                            type="text"
                            value={newPropertyOwnerForm.name}
                            onChange={(e) => handleNewPropertyOwnerInput('name', e.target.value)}
                            className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              newPropertyOwnerErrors.name ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Full name or household"
                          />
                          {newPropertyOwnerErrors.name && (
                            <p className="text-xs text-red-600 mt-1">{newPropertyOwnerErrors.name}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={newPropertyOwnerForm.email}
                            onChange={(e) => handleNewPropertyOwnerInput('email', e.target.value)}
                            className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              newPropertyOwnerErrors.email ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="owner@example.com"
                            required
                          />
                          {newPropertyOwnerErrors.email && (
                            <p className="text-xs text-red-600 mt-1">{newPropertyOwnerErrors.email}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                          <input
                            type="text"
                            value={newPropertyOwnerForm.phone}
                            onChange={(e) => handleNewPropertyOwnerInput('phone', e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="(555) 123-4567"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                          <select
                            value={newPropertyOwnerForm.userType}
                            onChange={(e) => handleNewPropertyOwnerInput('userType', e.target.value)}
                            className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              newPropertyOwnerErrors.userType ? 'border-red-500' : 'border-gray-300'
                            }`}
                          >
                            <option value="homeowner">Homeowner</option>
                            <option value="renter">Renter</option>
                          </select>
                          {newPropertyOwnerErrors.userType && (
                            <p className="text-xs text-red-600 mt-1">{newPropertyOwnerErrors.userType}</p>
                          )}
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Property Address</label>
                          <input
                            type="text"
                            value={newPropertyOwnerForm.propertyAddress}
                            onChange={(e) => handleNewPropertyOwnerInput('propertyAddress', e.target.value)}
                            className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              newPropertyOwnerErrors.propertyAddress ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="e.g. 9654 Privateer Road LGI"
                            required
                          />
                          {newPropertyOwnerErrors.propertyAddress && (
                            <p className="text-xs text-red-600 mt-1">{newPropertyOwnerErrors.propertyAddress}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Parcel Number</label>
                          <input
                            type="text"
                            value={newPropertyOwnerForm.parcelNumber}
                            onChange={(e) => handleNewPropertyOwnerInput('parcelNumber', e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Parcel number"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number</label>
                          <input
                            type="text"
                            value={newPropertyOwnerForm.lotNumber}
                            onChange={(e) => handleNewPropertyOwnerInput('lotNumber', e.target.value)}
                            className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              newPropertyOwnerErrors.lotNumber ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Lot identifier"
                            required
                          />
                          {newPropertyOwnerErrors.lotNumber && (
                            <p className="text-xs text-red-600 mt-1">{newPropertyOwnerErrors.lotNumber}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Status</label>
                          <select
                            value={newPropertyOwnerForm.homeownerStatus}
                            onChange={(e) => handleNewPropertyOwnerInput('homeownerStatus', e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {homeownerStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-2 flex items-center justify-end space-x-3 pt-2">
                          <button
                            type="button"
                            onClick={resetNewPropertyOwnerForm}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                            disabled={newPropertyOwnerSubmitting}
                          >
                            Clear
                          </button>
                          <button
                            type="submit"
                            disabled={newPropertyOwnerSubmitting}
                            className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                              newPropertyOwnerSubmitting
                                ? 'bg-blue-300 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {newPropertyOwnerSubmitting ? 'Adding...' : 'Add Property Owner'}
                          </button>
                        </div>
                      </form>
                      </div>
                    </details>
                  )}
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lot #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcel</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {propertyOwners.map((owner, index) => {
                            const statusValue = (owner.homeowner_status || '')
                              .toString()
                              .toLowerCase();
                            const isPendingReview =
                              statusValue === 'pending_verification' || statusValue === 'pending';
                            return (
                              <tr
                              key={owner.id || owner.email || index}
                              className={`hover:bg-gray-50 ${isPendingReview ? 'bg-yellow-50/60' : ''}`}
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {owner.name || owner.email || 'Unnamed Owner'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {owner.property_address || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {owner.lot_number || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {owner.parcel_number || 'N/A'}
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
                                {(() => {
                                  const status = deriveHomeownerStatus(owner);
                                  return (
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${status.className}`}>
                                      {status.label}
                                </span>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {adminMode ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                      onClick={() => handleEditPropertyOwner(owner)}
                                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                      title="Edit Property Owner"
                                    >
                                      ✏️ Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeletePropertyOwner(owner)}
                                      disabled={propertyOwnerDeletingId === owner.id}
                                      className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white ${
                                        propertyOwnerDeletingId === owner.id
                                          ? 'bg-red-300 cursor-not-allowed'
                                          : 'bg-red-600 hover:bg-red-700'
                                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500`}
                                      title="Delete Property Owner"
                                    >
                                      {propertyOwnerDeletingId === owner.id ? 'Deleting...' : '🗑 Delete'}
                                    </button>
                                  </div>
                                ) : hasValidOwnerEmail(owner) ? (
                                  <span className="text-gray-400 text-xs">Contact admin</span>
                                ) : (
                                  <span className="text-gray-400 text-xs">No email</span>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Registered Renters Section */}
                <div className="mb-8">
                  {(() => {
                    // Ensure allUsers is loaded
                    if (allUsers.length === 0 && adminMode) {
                      loadAllUsers();
                    }
                    
                    // Get all renters from allUsers (users table)
                    const rentersFromUsers = allUsers.filter(u => {
                      const userType = normalizeUserType(u.user_type || u.userType || u.user_role);
                      const isRenter = userType === 'renter';
                      if (isRenter) {
                        console.log(`Found renter: ${u.email}, user_type=${u.user_type || u.userType}`);
                      }
                      return isRenter;
                    });
                    
                    // Get all unique emails from bookings
                    const allBookingEmails = Array.from(new Set(bookings.map(b => b.guestEmail).filter(Boolean)));
                    
                    console.log(`Total users: ${allUsers.length}, Renters: ${rentersFromUsers.length}, Booking emails: ${allBookingEmails.length}`);
                    
                    // If allUsers hasn't loaded yet, show loading state
                    if (allUsers.length === 0) {
                      return (
                        <>
                          <h4 className="text-lg font-semibold mb-4 flex items-center">
                            👥 Registered Renters (Loading...)
                          </h4>
                          <div className="bg-white rounded-lg shadow p-4">
                            <p className="text-gray-500">Loading user data...</p>
                          </div>
                        </>
                      );
                    }
                    
                    // Show all renters from users table (they are registered users)
                    // Match with bookings to show booking info, but show all renters even without bookings
                    const rentersToShow = rentersFromUsers.map(renter => {
                      const renterEmailLower = (renter.email || '').toLowerCase().trim();
                      const hasBookings = allBookingEmails.some(bookingEmail => 
                        bookingEmail.toLowerCase().trim() === renterEmailLower
                      );
                      return {
                        ...renter,
                        hasBookings,
                        emailLower: renterEmailLower
                      };
                    });
                    
                    console.log(`Renters to show: ${rentersToShow.length}`, rentersToShow.map(r => ({ email: r.email, hasBookings: r.hasBookings })));
                    
                    return (
                      <>
                        <h4 className="text-lg font-semibold mb-4 flex items-center">
                          👥 Registered Renters ({rentersToShow.length})
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
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {rentersToShow.map(renterUser => {
                                  // Find bookings for this renter (case-insensitive email match)
                                  const userBookings = bookings.filter(b => 
                                    (b.guestEmail || '').toLowerCase().trim() === renterUser.emailLower
                                  );
                                  
                                  const latestBooking = userBookings.length > 0 ? userBookings[userBookings.length - 1] : null;
                                  const userType = 'renter'; // We already filtered for renters
                                  const totalBookings = userBookings.length;
                                  const confirmedBookings = userBookings.filter(b => b.status === 'confirmed').length;
                                  const email = renterUser.email; // Use the actual email from user object
                                  
                                  // Get name from user object or latest booking
                                  const name = renterUser.name || latestBooking?.guestName || email?.split('@')[0] || 'Unknown';
                                  const phone = renterUser.phone || latestBooking?.guestPhone || 'N/A';
                                  
                                  return (
                                    <tr key={email} className="hover:bg-gray-50">
                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {name}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <a href={`mailto:${email}`} className="text-blue-600 hover:text-blue-800">
                                          {email}
                                        </a>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {phone}
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
                      </>
                    );
                  })()}
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
                        <p className="text-sm font-medium text-gray-500">Registered Renters</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {(() => {
                            // Count renters from users table (same logic as Registered Renters section)
                            const rentersFromUsers = allUsers.filter(u => {
                              const userType = normalizeUserType(u.user_type || u.userType || u.user_role);
                              return userType === 'renter';
                            });
                            return rentersFromUsers.length;
                          })()}
                        </p>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {(() => {
                  console.log('AUTH DEBUG - Rendering login modal, authStep:', authStep, 'showLoginModal:', showLoginModal);
                  return authStep === 'login' ? 'Sign In' : 
                         authStep === 'register' ? 'Create Account' : 
                         authStep === 'verify-contact' ? 'Review Information' : 
                         authStep === 'forgot-password' ? 'Reset Password' :
                         authStep === 'reset-password' ? 'Set New Password' :
                         'Authentication';
                })()}
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
                  <p className="text-gray-600">Reset Your Password</p>
                  <p className="text-sm text-gray-500 mt-2">Enter your email, temporary password from the email, and your new password.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={tempEmail}
                    onChange={(e) => setTempEmail(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                  <input
                    type="password"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter temporary password from email"
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
                    placeholder="Enter new password (min. 6 characters)"
                    required
                    minLength={6}
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
                    minLength={6}
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
                  {registerData.userType === 'homeowner' && (
                    <p className="text-xs text-blue-600 mt-2">
                      Need help finding your Lot number or registered email? Reach out to Dock82 support at <a href="mailto:support@dock82.com" className="underline">support@dock82.com</a>.
                    </p>
                  )}
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
                  {registerData.userType === 'homeowner' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Property Address:</span>
                        <span className="text-sm text-gray-900">
                          {registerData.propertyAddress || 'Not selected'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Lot Number:</span>
                        <span className="text-sm text-gray-900">
                          {registerData.lotNumber || 'Not provided'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Additional Contact Fields for Homeowners */}
                {registerData.userType === 'homeowner' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Property Address</label>
                      {propertyOwnersLoading ? (
                        <p className="text-sm text-gray-500">Loading property addresses...</p>
                      ) : homeownerAddressOptions.length > 0 ? (
                        <select
                          value={registerData.propertyAddress || ''}
                          onChange={(e) => setRegisterData({...registerData, propertyAddress: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        >
                          <option value="">Select your property</option>
                          {homeownerAddressOptions.map((address) => (
                            <option key={address} value={address}>
                              {address}
                            </option>
                          ))}
                        </select>
                      ) : (
                      <input
                        type="text"
                        value={registerData.propertyAddress || ''}
                        onChange={(e) => setRegisterData({...registerData, propertyAddress: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Enter your property address"
                          required
                        />
                      )}
                      {propertyOwnersError && (
                        <p className="text-xs text-red-600 mt-1">{propertyOwnersError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number</label>
                      <input
                        type="text"
                        value={registerData.lotNumber || ''}
                        onChange={(e) => {
                          // Only allow numeric input
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          setRegisterData({...registerData, lotNumber: value});
                        }}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter the Lot number associated with your property"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        required
                      />
                        <p className="text-xs text-gray-500 mt-1">
                          This must match the Lot number on record for your property. Only numbers are allowed. If you are unsure, contact Dock82 support.
                        </p>
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



      {showAdminEditModal && editingAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Edit Admin</h3>
              <button onClick={handleCloseAdminModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {editingAdminErrors.general && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {editingAdminErrors.general}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingAdmin.name}
                  onChange={(e) => updateEditingAdmin('name', e.target.value)}
                  className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                    editingAdminErrors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Admin name"
                  required
                />
                {editingAdminErrors.name && (
                  <p className="text-xs text-red-600 mt-1">{editingAdminErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editingAdmin.email}
                  onChange={(e) => updateEditingAdmin('email', e.target.value)}
                  className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                    editingAdminErrors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="admin@example.com"
                  required
                />
                {editingAdminErrors.email && (
                  <p className="text-xs text-red-600 mt-1">{editingAdminErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  type="text"
                  value={editingAdmin.phone || ''}
                  onChange={(e) => updateEditingAdmin('phone', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={handleCloseAdminModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                disabled={adminSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdmin}
                disabled={adminSaving}
                className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                  adminSaving ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {adminSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Property Owner Edit Modal */}
      {showPropertyOwnerEditModal && editingPropertyOwner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Edit Property Owner</h3>
              <button
                onClick={handleClosePropertyOwnerModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {propertyOwnerFormErrors.general && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {propertyOwnerFormErrors.general}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner Name
                </label>
                <input
                  type="text"
                  value={editingPropertyOwner.name}
                  onChange={(e) => updatePropertyOwnerForm('name', e.target.value)}
                  className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    propertyOwnerFormErrors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter owner name"
                  required
                />
                {propertyOwnerFormErrors.name && (
                  <p className="text-xs text-red-600 mt-1">{propertyOwnerFormErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editingPropertyOwner.email}
                  onChange={(e) => updatePropertyOwnerForm('email', e.target.value)}
                  className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    propertyOwnerFormErrors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="owner@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to remove or if no email is available.
                </p>
                {propertyOwnerFormErrors.email && (
                  <p className="text-xs text-red-600 mt-1">{propertyOwnerFormErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={editingPropertyOwner.phone || ''}
                  onChange={(e) => updatePropertyOwnerForm('phone', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  User Type
                </label>
                <select
                  value={editingPropertyOwner.userType}
                  onChange={(e) => updatePropertyOwnerForm('userType', e.target.value)}
                  className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    propertyOwnerFormErrors.userType ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="homeowner">Homeowner</option>
                  <option value="renter">Renter</option>
                </select>
                {propertyOwnerFormErrors.userType && (
                  <p className="text-xs text-red-600 mt-1">{propertyOwnerFormErrors.userType}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Address
                </label>
                <input
                  type="text"
                  value={editingPropertyOwner.propertyAddress || ''}
                  onChange={(e) => updatePropertyOwnerForm('propertyAddress', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter property address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parcel Number
                </label>
                <input
                  type="text"
                  value={editingPropertyOwner.parcelNumber || ''}
                  onChange={(e) => updatePropertyOwnerForm('parcelNumber', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Parcel number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lot Number
                </label>
                <input
                  type="text"
                  value={editingPropertyOwner.lotNumber || ''}
                  onChange={(e) => updatePropertyOwnerForm('lotNumber', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Lot number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner Status
                </label>
                <select
                  value={editingPropertyOwner.homeownerStatus || ''}
                  onChange={(e) => updatePropertyOwnerForm('homeownerStatus', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {homeownerStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Use "Verified" once ownership has been confirmed.
                </p>
              </div>

              {editingPropertyOwner.homeownerStatus === 'inactive_owner' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Outstanding Dues ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingPropertyOwner.dues || ''}
                    onChange={(e) => updatePropertyOwnerForm('dues', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the amount the homeowner needs to pay to reactivate their account.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end mt-6 space-x-3">
              <button
                type="button"
                onClick={handleClosePropertyOwnerModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                disabled={propertyOwnerSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePropertyOwner}
                disabled={propertyOwnerSaving}
                className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                  propertyOwnerSaving
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {propertyOwnerSaving ? 'Saving...' : 'Save Changes'}
              </button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
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
