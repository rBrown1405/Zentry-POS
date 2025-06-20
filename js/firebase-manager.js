/**
 * Firebase Service Manager for Zentry POS System
 * Handles all Firebase interactions for authentication, database, and storage
 */
class FirebaseManager {
  constructor() {
    // Initialize with null values and wait for Firebase services
    this.app = null;
    this.auth = null;
    this.db = null;
    this.storage = null;
    
    // User information
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    
    // Initialize when Firebase services are ready
    this.initializeServices();
  }
    /**
   * Initialize Firebase services when they become available
   */
  initializeServices() {
    const checkServices = () => {
      if (window.firebaseServices) {
        // Check if Firebase is disabled
        if (window.firebaseServices.isDisabled()) {
          console.log('Firebase is disabled, FirebaseManager operating in localStorage mode');
          this.app = null;
          this.auth = null;
          this.db = null;
          this.storage = null;
          return;
        }
        
        // Get Firebase services
        this.app = window.firebaseServices.getApp();
        this.auth = window.firebaseServices.getAuth();
        this.db = window.firebaseServices.getDb();
        this.storage = window.firebaseServices.getStorage();
        
        // Set up auth state change listener only if auth is available
        if (this.auth) {
          this.auth.onAuthStateChanged(user => {
            if (user) {
              // User is signed in
              this.user = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                emailVerified: user.emailVerified,
                role: user.customClaims ? user.customClaims.role : 'employee' // Default role
              };
              
              localStorage.setItem('user', JSON.stringify(this.user));
            } else {
              // User is signed out
              this.user = null;
              localStorage.removeItem('user');
            }
          });
        }
        
        console.log('FirebaseManager initialized successfully');
      } else {
        // Retry after a short delay
        setTimeout(checkServices, 100);
      }
    };
    
    checkServices();
  }
    /**
   * Check if the user is authenticated
   * @returns {boolean} - True if authenticated
   */
  isAuthenticated() {
    // If Firebase is disabled, check localStorage for authentication
    if (window.firebaseServices && window.firebaseServices.isDisabled()) {
      return this.user !== null;
    }
    return this.auth && this.auth.currentUser !== null;
  }
  
  /**
   * Get the current user's role
   * @returns {string|null} - User role or null if not authenticated
   */
  getUserRole() {
    return this.user ? this.user.role : null;
  }
  
  /**
   * Get the current user's information
   * @returns {Object|null} - User object or null if not authenticated
   */
  getCurrentUser() {
    return this.user;
  }
    /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} - Promise resolving to user credentials
   */
  async login(email, password) {
    try {
      // If Firebase is disabled, use localStorage authentication simulation
      if (window.firebaseServices && window.firebaseServices.isDisabled()) {
        // Simple localStorage-based authentication for development
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        const userKey = email.toLowerCase();
        
        if (users[userKey] && users[userKey].password === password) {
          this.user = {
            uid: users[userKey].uid || 'local_' + Date.now(),
            email: email,
            displayName: users[userKey].displayName || email,
            photoURL: users[userKey].photoURL || null,
            emailVerified: true,
            role: users[userKey].role || 'employee'
          };
          
          localStorage.setItem('user', JSON.stringify(this.user));
          return this.user;
        } else {
          throw new Error('Invalid email or password');
        }
      }
      
      // Use Firebase authentication if available
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      const idTokenResult = await userCredential.user.getIdTokenResult();
      
      // Store role information
      this.user = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL,
        emailVerified: userCredential.user.emailVerified,
        role: idTokenResult.claims.role || 'employee'
      };
      
      localStorage.setItem('user', JSON.stringify(this.user));
      return this.user;
    } catch (error) {
      console.error("Login failed:", error.message);
      throw error;
    }
  }
    /**
   * Log out the current user
   * @returns {Promise} - Promise resolving to void
   */
  async logout() {
    try {
      // If Firebase is disabled, just clear localStorage
      if (window.firebaseServices && window.firebaseServices.isDisabled()) {
        this.user = null;
        localStorage.removeItem('user');
        return;
      }
      
      // Use Firebase logout if available
      await this.auth.signOut();
      this.user = null;
      localStorage.removeItem('user');
    } catch (error) {
      console.error("Logout failed:", error.message);
      throw error;
    }
  }
    /**
   * Register a new user
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} userData - Additional user data
   * @returns {Promise} - Promise resolving to user credentials
   */
  async register(email, password, userData = {}) {
    try {
      // If Firebase is disabled, use localStorage registration simulation
      if (window.firebaseServices && window.firebaseServices.isDisabled()) {
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        const userKey = email.toLowerCase();
        
        if (users[userKey]) {
          throw new Error('User already exists');
        }
        
        const newUser = {
          uid: 'local_' + Date.now(),
          email: email,
          password: password, // Note: In real apps, never store plain text passwords
          displayName: userData.displayName || email,
          photoURL: userData.photoURL || null,
          role: userData.role || 'employee',
          createdAt: new Date().toISOString(),
          ...userData
        };
        
        users[userKey] = newUser;
        localStorage.setItem('users', JSON.stringify(users));
        
        // Also store in unified database
        await window.firebaseServices.db.collection('users').doc(newUser.uid).set(newUser);
        
        return { uid: newUser.uid, email: email };
      }
      
      // Use Firebase registration if available
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      
      // Update profile
      if (userData.displayName) {
        await userCredential.user.updateProfile({
          displayName: userData.displayName,
          photoURL: userData.photoURL || null
        });
      }
      
      // Store additional user data in database
      await window.firebaseServices.db.collection('users').doc(userCredential.user.uid).set({
        email: email,
        displayName: userData.displayName || '',
        role: userData.role || 'employee',
        createdAt: new Date().toISOString(),
        ...userData
      });
      
      return userCredential.user;
    } catch (error) {
      console.error("Registration failed:", error.message);
      throw error;
    }
  }
  
  // Menu Items CRUD Operations
    /**
   * Get all menu items
   * @returns {Promise<Array>} - Promise resolving to array of menu items
   */
  async getMenuItems() {
    try {
      const menuSnapshot = await window.firebaseServices.db.collection('menu_items').get();
      return menuSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Failed to fetch menu items:", error);
      throw error;
    }
  }
    /**
   * Add a new menu item
   * @param {Object} menuItem - Menu item data
   * @returns {Promise<string>} - Promise resolving to created document ID
   */
  async addMenuItem(menuItem) {
    try {
      // Generate unique ID for localStorage mode
      const id = 'menu_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const menuItemData = {
        ...menuItem,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await window.firebaseServices.db.collection('menu_items').doc(id).set(menuItemData);
      return id;
    } catch (error) {
      console.error("Failed to add menu item:", error);
      throw error;
    }
  }
    /**
   * Update a menu item
   * @param {string} id - Menu item ID
   * @param {Object} menuItemData - Updated menu item data
   * @returns {Promise<void>}
   */
  async updateMenuItem(id, menuItemData) {
    try {
      const updateData = {
        ...menuItemData,
        updatedAt: new Date().toISOString()
      };
      
      await window.firebaseServices.db.collection('menu_items').doc(id).update(updateData);
    } catch (error) {
      console.error("Failed to update menu item:", error);
      throw error;
    }
  }

  /**
   * Delete a menu item
   * @param {string} id - Menu item ID
   * @returns {Promise<void>}
   */
  async deleteMenuItem(id) {
    try {
      await window.firebaseServices.db.collection('menu_items').doc(id).delete();
    } catch (error) {
      console.error("Failed to delete menu item:", error);
      throw error;
    }
  }
  
  // Tables management
  
  /**
   * Get all tables
   * @returns {Promise<Array>} - Promise resolving to array of tables
   */
  async getTables() {
    try {
      const tablesSnapshot = await this.db.collection('tables').get();
      return tablesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Failed to fetch tables:", error);
      throw error;
    }
  }
  
  /**
   * Add a new table
   * @param {Object} tableData - Table data
   * @returns {Promise<string>} - Promise resolving to created document ID
   */
  async addTable(tableData) {
    try {
      const docRef = await this.db.collection('tables').add({
        ...tableData,
        status: tableData.status || 'available',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error("Failed to add table:", error);
      throw error;
    }
  }
  
  /**
   * Update a table
   * @param {string} id - Table ID
   * @param {Object} tableData - Updated table data
   * @returns {Promise<void>}
   */
  async updateTable(id, tableData) {
    try {
      await this.db.collection('tables').doc(id).update({
        ...tableData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to update table:", error);
      throw error;
    }
  }
  
  // Orders management
  
  /**
   * Get all orders
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Promise resolving to array of orders
   */
  async getOrders(options = {}) {
    try {
      let query = this.db.collection('orders');
      
      if (options.status) {
        query = query.where('status', '==', options.status);
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      const ordersSnapshot = await query.orderBy('createdAt', 'desc').get();
      return ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      throw error;
    }
  }
  
  /**
   * Get order by ID
   * @param {string} id - Order ID
   * @returns {Promise<Object>} - Promise resolving to order data
   */
  async getOrderById(id) {
    try {
      const orderDoc = await this.db.collection('orders').doc(id).get();
      if (!orderDoc.exists) {
        throw new Error(`Order with ID ${id} not found`);
      }
      return {
        id: orderDoc.id,
        ...orderDoc.data()
      };
    } catch (error) {
      console.error("Failed to fetch order:", error);
      throw error;
    }
  }
  
  /**
   * Create a new order
   * @param {Object} orderData - Order data
   * @returns {Promise<string>} - Promise resolving to created document ID
   */
  async createOrder(orderData) {
    try {
      // Add a new order
      const orderRef = await this.db.collection('orders').add({
        ...orderData,
        status: orderData.status || 'new',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // If order is associated with a table, update table status
      if (orderData.tableId) {
        await this.db.collection('tables').doc(orderData.tableId).update({
          status: 'occupied',
          currentOrderId: orderRef.id,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      
      return orderRef.id;
    } catch (error) {
      console.error("Failed to create order:", error);
      throw error;
    }
  }
  
  /**
   * Update order status
   * @param {string} id - Order ID
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  async updateOrderStatus(id, status) {
    try {
      await this.db.collection('orders').doc(id).update({
        status: status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // If order is completed or cancelled, update table status
      const orderDoc = await this.db.collection('orders').doc(id).get();
      const orderData = orderDoc.data();
      
      if ((status === 'completed' || status === 'cancelled') && orderData.tableId) {
        await this.db.collection('tables').doc(orderData.tableId).update({
          status: 'available',
          currentOrderId: null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Failed to update order status:", error);
      throw error;
    }
  }
  
  // Real-time listeners
  
  /**
   * Listen to menu item changes
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  onMenuItemsChange(callback) {
    return this.db.collection('menu_items')
      .onSnapshot(snapshot => {
        const menuItems = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback(menuItems);
      }, error => {
        console.error("Menu items listener error:", error);
      });
  }
  
  /**
   * Listen to table changes
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  onTablesChange(callback) {
    return this.db.collection('tables')
      .onSnapshot(snapshot => {
        const tables = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback(tables);
      }, error => {
        console.error("Tables listener error:", error);
      });
  }
  
  /**
   * Listen to order changes
   * @param {Function} callback - Callback function
   * @param {Object} options - Query options
   * @returns {Function} - Unsubscribe function
   */
  onOrdersChange(callback, options = {}) {
    let query = this.db.collection('orders');
    
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    
    return query.orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback(orders);
      }, error => {
        console.error("Orders listener error:", error);
      });
  }
  
  /**
   * Upload an image to Firebase Storage
   * @param {File} file - Image file
   * @param {string} path - Path in storage
   * @returns {Promise<string>} - Promise resolving to download URL
   */
  async uploadImage(file, path = 'images') {
    try {
      const storageRef = this.storage.ref();
      const fileRef = storageRef.child(`${path}/${Date.now()}_${file.name}`);
      
      // Upload file
      await fileRef.put(file);
      
      // Get download URL
      const downloadURL = await fileRef.getDownloadURL();
      return downloadURL;
    } catch (error) {
      console.error("Failed to upload image:", error);
      throw error;
    }
  }
}

// Create global instance when Firebase services are ready
document.addEventListener('DOMContentLoaded', function() {
  // Wait for Firebase services to be initialized
  const initManager = () => {
    if (window.firebaseServices) {
      window.firebaseManager = new FirebaseManager();
      console.log('FirebaseManager instance created globally');
    } else {
      // Retry after a short delay
      setTimeout(initManager, 100);
    }
  };
  
  initManager();
});
