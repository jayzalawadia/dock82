import { supabase } from './supabase';

// File upload utilities for Supabase Storage with RLS policies

/**
 * Upload slip image to the slip-images bucket
 * @param {File} file - The image file to upload
 * @param {string} slipId - The slip ID for the image
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export const uploadSlipImage = async (file, slipId) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${slipId}-${Date.now()}.${fileExt}`;
    const filePath = `${slipId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('slip-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading slip image:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('slip-images')
      .getPublicUrl(filePath);

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('Unexpected error uploading slip image:', error);
    return { success: false, error: 'Failed to upload image' };
  }
};

/**
 * Upload user document to the documents bucket
 * @param {File} file - The document file to upload
 * @param {string} userId - The authenticated user's ID
 * @param {string} documentType - Type of document (e.g., 'rental-agreement', 'insurance-proof')
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export const uploadUserDocument = async (file, userId, documentType) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${documentType}-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading user document:', error);
      return { success: false, error: error.message };
    }

    // Get signed URL for private access
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (urlError) {
      console.error('Error creating signed URL:', urlError);
      return { success: false, error: 'Failed to create access URL' };
    }

    return { 
      success: true, 
      url: signedUrlData.signedUrl,
      fileName: fileName,
      filePath: filePath
    };
  } catch (error) {
    console.error('Unexpected error uploading user document:', error);
    return { success: false, error: 'Failed to upload document' };
  }
};

/**
 * Get user document URL
 * @param {string} userId - The authenticated user's ID
 * @param {string} fileName - The document file name
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export const getUserDocumentUrl = async (userId, fileName) => {
  try {
    const filePath = `${userId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      console.error('Error getting document URL:', error);
      return { success: false, error: error.message };
    }

    return { success: true, url: data.signedUrl };
  } catch (error) {
    console.error('Unexpected error getting document URL:', error);
    return { success: false, error: 'Failed to get document URL' };
  }
};

/**
 * Delete user document
 * @param {string} userId - The authenticated user's ID
 * @param {string} fileName - The document file name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteUserDocument = async (userId, fileName) => {
  try {
    const filePath = `${userId}/${fileName}`;

    const { error } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting document:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error deleting document:', error);
    return { success: false, error: 'Failed to delete document' };
  }
};

/**
 * List user documents
 * @param {string} userId - The authenticated user's ID
 * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
 */
export const listUserDocuments = async (userId) => {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .list(userId, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('Error listing documents:', error);
      return { success: false, error: error.message };
    }

    return { success: true, files: data };
  } catch (error) {
    console.error('Unexpected error listing documents:', error);
    return { success: false, error: 'Failed to list documents' };
  }
};

/**
 * Validate file type and size
 * @param {File} file - The file to validate
 * @param {Array} allowedTypes - Allowed MIME types
 * @param {number} maxSizeMB - Maximum file size in MB
 * @returns {Object} Validation result
 */
export const validateFile = (file, allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'], maxSizeMB = 10) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` 
    };
  }

  if (file.size > maxSizeBytes) {
    return { 
      valid: false, 
      error: `File too large. Maximum size: ${maxSizeMB}MB` 
    };
  }

  return { valid: true };
};
