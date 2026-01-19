// Component descriptions for the assessment journey
module.exports = {
  'ACM': {
    summary: 'Access Management (ACM) provides role-based access control and authorization services across HMCTS applications. It manages user permissions, roles, and organizational hierarchies to ensure users can only access the data and functions appropriate to their role.',
    capabilities: [
      'Role-based access control (RBAC)',
      'Organizational hierarchies and case assignments',
      'Dynamic permission management',
      'User role mapping and inheritance',
      'Access control integration with CCD'
    ],
    users: 'ACM is used by system administrators to configure roles and permissions, and indirectly by all users whose access to case data is governed by their assigned roles.'
  },
  'BKP': {
    summary: 'Bulk Print enables the automated printing and dispatch of large volumes of court documents and correspondence. It provides a centralized service for generating physical documents that need to be sent to parties involved in legal proceedings.',
    capabilities: [
      'Bulk document printing',
      'Print job scheduling and management',
      'Integration with document generation services',
      'Print tracking and status monitoring'
    ],
    users: 'BKP is used by administrative staff and automated systems that need to send physical correspondence to citizens, legal representatives, and other parties.'
  },
  'BKS': {
    summary: 'Bulk Scan provides automated document scanning and digitization services for paper-based submissions. It processes incoming paper forms and documents, extracting data and attaching scanned images to digital cases.',
    capabilities: [
      'Automated document scanning and OCR',
      'Form recognition and data extraction',
      'Exception handling for unclear submissions',
      'Integration with case management systems',
      'Document classification and routing'
    ],
    users: 'BKS is used by scanning teams, caseworkers who process paper submissions, and automated workflows that ingest scanned documents into digital cases.'
  },
  'CCD': {
    summary: 'Core Case Data (CCD) is HMCTS\'s central platform for managing case data across all jurisdictions. It provides a flexible, configurable framework for storing, accessing, and processing case information throughout the case lifecycle.',
    capabilities: [
      'Case data storage and management',
      'Configurable case types and workflows',
      'Role-based access control',
      'Event-driven case progression',
      'Document management integration',
      'Search and filtering',
      'Case history and audit trail'
    ],
    users: 'CCD is used by caseworkers, judicial office holders, legal professionals, and citizens to create, view, and update case information across multiple HMCTS services.'
  },
  'DOC': {
    summary: 'Document Generation (DocGen) provides template-based document creation services. It merges case data with predefined templates to generate court orders, letters, forms, and other legal documents in consistent formats.',
    capabilities: [
      'Template-based document generation',
      'Data merging from case management systems',
      'Multiple output formats (PDF, DOCX)',
      'Template version control'
    ],
    users: 'DocGen is used by caseworkers and judicial office holders who need to generate official court documents, orders, and correspondence based on case data.'
  },
  'FEE': {
    summary: 'Fees and Payments manages the calculation, collection, and reconciliation of court fees. It handles fee assessment, payment processing, refunds, remissions (fee waivers), and financial reporting for all HMCTS services.',
    capabilities: [
      'Fee calculation based on case type and value',
      'Payment processing (online and offline)',
      'Payment reconciliation and reporting',
      'Fee remissions and help with fees',
      'Refund processing',
      'Integration with GOV.UK Pay',
      'Financial audit trails'
    ],
    users: 'Fees and Payments is used by citizens making payments, caseworkers processing applications, finance administrators reconciling payments, and judicial staff reviewing fee remission applications.'
  },
  'HMC': {
    summary: 'Hearings Management Component (HMC) provides end-to-end hearing scheduling and management capabilities. It coordinates the complex task of booking courtrooms, judges, and participants for hearings across multiple jurisdictions.',
    capabilities: [
      'Hearing scheduling and booking',
      'Room and resource allocation',
      'Judge and participant availability management',
      'Hearing notifications and updates',
      'Integration with listing systems',
      'Hearing history and audit trail'
    ],
    users: 'HMC is used by listing officers who schedule hearings, judges who manage their calendars, caseworkers who request hearings, and participants who receive hearing notifications.'
  },
  'IDM': {
    summary: 'Identity Management (IDM) provides authentication, user registration, and profile management services. It acts as the single sign-on (SSO) solution for HMCTS services, managing user credentials and authentication flows.',
    capabilities: [
      'User authentication and single sign-on (SSO)',
      'User registration and profile management',
      'Multi-factor authentication (MFA)',
      'Integration with government identity systems',
      'Password management and security policies'
    ],
    users: 'IDM is used by all HMCTS users who need to authenticate and access digital services, including citizens, legal professionals, caseworkers, and judicial office holders.'
  },
  'LST': {
    summary: 'List Assist provides hearing listing and courtroom scheduling capabilities specifically designed for judicial requirements. It helps manage daily court lists, hearing allocations, and judicial assignments.',
    capabilities: [
      'Daily court list management',
      'Hearing allocation and scheduling',
      'Judicial assignment coordination',
      'Courtroom resource management'
    ],
    users: 'List Assist is used by listing officers and judicial office holders to manage court schedules, allocate hearings to courtrooms, and ensure efficient use of judicial resources.'
  },
  'NOT': {
    summary: 'GOV.UK Notify integration enables HMCTS services to send emails, SMS messages, and letters to users. It provides a centralized notification service for all user communications using the GOV.UK Notify platform.',
    capabilities: [
      'Email notifications',
      'SMS notifications',
      'Letter generation and dispatch',
      'Template-based messaging',
      'Delivery tracking and status'
    ],
    users: 'GOV.UK Notify is used indirectly by all users who receive communications from HMCTS services, including case updates, hearing notifications, and system alerts.'
  },
  'REF': {
    summary: 'Reference Data provides centralized management of common data used across HMCTS services. It maintains authoritative lists of courts, organizations, categories, and other reference information needed by multiple systems.',
    capabilities: [
      'Centralized reference data storage',
      'Court and organization directories',
      'Category and classification management',
      'Data versioning and history',
      'API access for consuming services'
    ],
    users: 'Reference Data is used by system administrators who maintain reference lists and indirectly by all services that consume this data for dropdowns, validation, and business logic.'
  },
  'VHS': {
    summary: 'Video Hearings Service enables remote video hearings for court proceedings. It provides secure video conferencing capabilities integrated with case management and hearing scheduling systems.',
    capabilities: [
      'Secure video conferencing',
      'Hearing room management',
      'Participant management and invitations',
      'Recording and playback',
      'Integration with hearing management'
    ],
    users: 'Video Hearings is used by judges, legal representatives, witnesses, and other hearing participants who need to attend court proceedings remotely via video link.'
  },
  'XUI': {
    summary: 'Expert UI (XUI) provides the user interface framework for caseworkers and legal professionals. It offers a consistent, accessible interface for managing cases, viewing case data, and performing case operations.',
    capabilities: [
      'Case list and search interfaces',
      'Case detail views and navigation',
      'Form-based data entry',
      'Document viewing and management',
      'Task and work allocation views',
      'Accessibility compliance (WCAG 2.1)'
    ],
    users: 'XUI is used by caseworkers, legal professionals, and judicial office holders who need to access and manage case information through a web-based interface.'
  }
};
