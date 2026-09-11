// ═══════════════════════════════════════════════════════════════════════════
//  GTS SERVICE CATALOG — generated from docs/GTS_Assignment_Catalog.json (v1.0, 2026-09-11)
//  17 work areas · 124 assignment types · 12 inventory types · 8 projects
//  Evidence levels: core = established work area · discussed = previously
//  discussed request · proposed = suggested team process. All entries are
//  editable templates, not proof of an official service menu.
//  Regenerate with: python3 scripts/build-catalog.py
// ═══════════════════════════════════════════════════════════════════════════

export const CATALOG_META = { version: '1.0', preparedOn: '2026-09-11', department: "B&H Photo Video Guest Tech Support" };

export const EVIDENCE_LEVELS = {
  "core": "Explicitly supported work area or existing work tool in our discussions. Detailed checklists are proposed standardization, not verified company procedure.",
  "discussed": "A technical request we previously discussed. It supports this candidate assignment type, but does not prove it was a customer job, a completed service, or an officially offered GTS service.",
  "proposed": "Suggested team process or project for the app. It is not established as a current assigned duty."
};

export const CATEGORIES = [
  {
    "id": "INT",
    "name": "Customer intake, troubleshooting, and service records",
    "purpose": "Capture the customer goal, investigate the problem, and leave a usable record for the next technician.",
    "fields": [
      "Customer goal",
      "Exact symptom/error",
      "When the issue happens",
      "Device and accessory combination",
      "Prior attempts",
      "Case owner",
      "External Salesforce reference",
      "Outcome and next action"
    ],
    "resources": [
      "Assigned workstation",
      "Existing Salesforce access",
      "Known-good test accessories",
      "Relevant product instructions"
    ]
  },
  {
    "id": "FWC",
    "name": "Camera and camcorder firmware",
    "purpose": "Manage firmware work as a traceable change to a specific device, with its starting version and observed result.",
    "fields": [
      "Exact model/region",
      "Current version",
      "Target version",
      "Official source URL",
      "Source checked date",
      "Required intermediate versions",
      "Update method",
      "Power readiness",
      "Post-update version"
    ],
    "resources": [
      "Workstation with the required updater",
      "Compatible card and reader",
      "Correct USB data cable",
      "Charged battery or suitable power supply"
    ]
  },
  {
    "id": "FWA",
    "name": "Lens and accessory firmware",
    "purpose": "Track firmware separately for each component; a camera body update does not describe the state of its accessories.",
    "fields": [
      "Accessory make/model/revision",
      "Host camera or computer",
      "Before/after version",
      "Dock or connection method",
      "Official instructions",
      "Compatibility tested"
    ],
    "resources": [
      "Lens dock or console where required",
      "USB data cables",
      "Manufacturer updater",
      "Compatible host device"
    ]
  },
  {
    "id": "CAM",
    "name": "Camera, camcorder, lens, and film-camera support",
    "purpose": "Provide setup, operating instruction, and external diagnosis of imaging equipment.",
    "fields": [
      "Body/lens/adapter combination",
      "Shooting mode",
      "Exact error",
      "Settings changed",
      "Battery/media used",
      "Before/after behavior",
      "Referral needed"
    ],
    "resources": [
      "Known-good compatible lens",
      "Battery/charger",
      "Supported recording media",
      "Appropriate test subject",
      "Manufacturer manual"
    ]
  },
  {
    "id": "MOB",
    "name": "Camera-to-phone and mobile-device connections",
    "purpose": "Treat connection setup, image transfer, and remote control as separate outcomes.",
    "fields": [
      "Phone/tablet model",
      "OS version",
      "Camera model/version",
      "Companion app/version",
      "Connection method",
      "Permission state",
      "Transfer/control test"
    ],
    "resources": [
      "Supported companion app",
      "Compatible USB/mobile adapter",
      "Wi-Fi/Bluetooth capability as required",
      "Sample customer-approved test file"
    ]
  },
  {
    "id": "PC",
    "name": "Computer setup, operating systems, and hardware troubleshooting",
    "purpose": "Track operating-system work and hardware diagnosis with the original data-preservation goal attached.",
    "fields": [
      "Computer model",
      "OS edition/build",
      "Installation/recovery media",
      "Drive visibility",
      "Keyboard/mouse availability",
      "License status without key",
      "Data-preservation requirement",
      "Before/after state"
    ],
    "resources": [
      "Installation/recovery USB media",
      "Model-specific driver packages",
      "Known-good peripherals",
      "Compatible display cables",
      "Vendor diagnostics when available"
    ]
  },
  {
    "id": "SW",
    "name": "Software downloads, installation, and licensing support",
    "purpose": "Record why software was installed, the version actually used, and whether it launched successfully.",
    "fields": [
      "Application/version",
      "OS compatibility",
      "Official source URL",
      "Source checked date",
      "Installation result",
      "License status without credentials",
      "Permission blocker"
    ],
    "resources": [
      "Approved workstation permissions",
      "Official installers",
      "Vendor documentation",
      "Customer-controlled sign-in when required"
    ]
  },
  {
    "id": "DAT",
    "name": "File transfers, backups, and device migrations",
    "purpose": "Record what should move, where it should go, and how completion was checked.",
    "fields": [
      "Source device and location",
      "Destination device and folder reference",
      "Agreed file scope",
      "Estimated/actual bytes",
      "Copy errors/skips",
      "Cloud download state",
      "Elapsed vs active time",
      "Verification method"
    ],
    "resources": [
      "Known-good readers and data cables",
      "Adequate destination storage",
      "Migration utilities",
      "Approved copy tools such as Robocopy when applicable"
    ]
  },
  {
    "id": "REC",
    "name": "Storage diagnosis, data recovery, and formatting",
    "purpose": "Keep source preservation, recovery output, and any authorized erasure distinct in the job record.",
    "fields": [
      "Source media ID/type/capacity",
      "Detection state",
      "Exact error",
      "Reader/connection tested",
      "Recovery tool/version",
      "Scan/session reference",
      "Separate destination",
      "Recovered counts/bytes",
      "Validation result",
      "Erase authorization if applicable"
    ],
    "resources": [
      "Compatible known-good readers",
      "Separate recovery destination",
      "Available authorized recovery tools such as DMDE",
      "Disk-management tools",
      "Suitable workstation"
    ]
  },
  {
    "id": "MED",
    "name": "Photo, video, and legacy-media handling",
    "purpose": "Track successful playback and usable output, not just a conversion process completing.",
    "fields": [
      "Source medium/file format",
      "Target format/device",
      "Application/version",
      "Selected titles/files",
      "Output location",
      "Duration/count",
      "Playback and audio checks"
    ],
    "resources": [
      "Suitable optical drive when needed",
      "Approved media player/converter",
      "Separate output storage",
      "Legacy playback/capture equipment if available"
    ]
  },
  {
    "id": "AUD",
    "name": "Microphones, audio recorders, and audio connections",
    "purpose": "Track transmitter pairing, receiver output, host input, and recorded audio as separate checks.",
    "fields": [
      "Transmitter/receiver models",
      "Host camera/phone/computer",
      "App",
      "Cable/adapter chain",
      "Input/output mode",
      "Channel mapping",
      "Test recording result"
    ],
    "resources": [
      "Compatible audio and data cables",
      "Appropriate mobile adapters",
      "Headphones",
      "Recording media",
      "Supported companion app"
    ]
  },
  {
    "id": "LGT",
    "name": "Flashes, strobes, and radio triggers",
    "purpose": "Treat physical fit, radio compatibility, channel/group setup, and synchronized exposure as different questions.",
    "fields": [
      "Camera/flash/trigger models",
      "Radio system",
      "Channel/group/ID where supported",
      "Operating mode",
      "Connection method",
      "Test-fire result",
      "Captured-image result"
    ],
    "resources": [
      "Compatible camera/flash/trigger combination",
      "Charged batteries",
      "Appropriate sync accessories",
      "Product manuals"
    ]
  },
  {
    "id": "VID",
    "name": "Monitors, gimbals, drones, and video accessories",
    "purpose": "Track the display path separately from control, pairing, and accessory operation.",
    "fields": [
      "All component models/revisions",
      "Firmware versions relevant to issue",
      "Signal cable/port",
      "Control method",
      "Pairing result",
      "Display/control test",
      "Mechanical setup notes"
    ],
    "resources": [
      "Correct HDMI/data/control cables",
      "Appropriate mounts and power",
      "Manufacturer apps",
      "Compatible host equipment"
    ]
  },
  {
    "id": "PRN",
    "name": "Printers, small electronics, and general accessories",
    "purpose": "Capture the exact requested everyday function so a simple support interaction can be logged quickly.",
    "fields": [
      "Device and host model",
      "Requested operation",
      "Consumable identifiers",
      "Connection method",
      "Settings changed",
      "Demonstration result"
    ],
    "resources": [
      "Appropriate printer paper/ink",
      "Compatible adapters and cables",
      "Product manual",
      "Supported phone app"
    ]
  },
  {
    "id": "RES",
    "name": "Product research, customer instructions, and referrals",
    "purpose": "Preserve useful answers with their evidence so the same question is easier to answer next time.",
    "fields": [
      "Exact product/variant",
      "Customer question",
      "Source URL",
      "Date checked",
      "Finding",
      "Uncertainty",
      "Referral or instructions supplied"
    ],
    "resources": [
      "Manufacturer manuals and support pages",
      "Product documentation",
      "Existing authorized company information"
    ]
  },
  {
    "id": "INV",
    "name": "Inventory and station operations",
    "purpose": "These are proposed workflows responding to the station-equipment and organization needs you raised; exact assignments and frequencies need team confirmation.",
    "fields": [
      "Item ID/type",
      "Owner type",
      "Location/bin",
      "Quantity or asset identity",
      "Condition",
      "Compatibility attributes",
      "Current reservation/user/job",
      "Movement reason",
      "Count/review date"
    ],
    "resources": [
      "Existing station equipment",
      "Storage bins and labels",
      "Inventory app",
      "Actual staff-assigned workstations"
    ]
  },
  {
    "id": "KNW",
    "name": "Knowledge sharing, training, and workflow improvement",
    "purpose": "Build reusable team knowledge from verified work while keeping suggested procedures distinguishable from proven ones.",
    "fields": [
      "Topic/model",
      "Article or project owner",
      "Source case",
      "Status",
      "Source URLs",
      "Last verified date",
      "Reviewer",
      "Next review/next action"
    ],
    "resources": [
      "Case log",
      "SOP/knowledge section",
      "Inventory records",
      "Existing team processes"
    ]
  }
];

export const ASSIGNMENT_TYPES = [
  {
    "id": "INT-01",
    "cat": "INT",
    "title": "Assess the support request",
    "scope": "Clarify what the customer wants to accomplish, the reported problem, and the requested service.",
    "evidence": "A concise goal and initial service category are recorded.",
    "level": "core"
  },
  {
    "id": "INT-02",
    "cat": "INT",
    "title": "Identify the equipment involved",
    "scope": "Record exact make/model, relevant OS or firmware, and connected accessories; distinguish variants that affect compatibility.",
    "evidence": "The actual device combination is identifiable without relying on a photo alone.",
    "level": "proposed"
  },
  {
    "id": "INT-03",
    "cat": "INT",
    "title": "Diagnose and isolate a reported problem",
    "scope": "Reproduce symptoms where possible and compare settings, ports, cables, readers, and known-good equipment one variable at a time.",
    "evidence": "Tests and observations are recorded; the conclusion is marked verified, suspected, or undetermined.",
    "level": "core"
  },
  {
    "id": "INT-04",
    "cat": "INT",
    "title": "Record work in Salesforce",
    "scope": "Document the interaction in the existing work system using its actual required workflow.",
    "evidence": "The external reference and a concise summary are recorded when available.",
    "level": "core"
  },
  {
    "id": "INT-05",
    "cat": "INT",
    "title": "Document the authorized work scope",
    "scope": "Record requested operations, data to preserve, and any permission needed for changes such as a reset or format.",
    "evidence": "The work scope is clear before those operations start.",
    "level": "proposed"
  },
  {
    "id": "INT-06",
    "cat": "INT",
    "title": "Assign and hand off a job",
    "scope": "Name an owner, the next action, its blocker, and the equipment or station currently in use.",
    "evidence": "The receiving technician can continue without repeating intake.",
    "level": "proposed"
  },
  {
    "id": "INT-07",
    "cat": "INT",
    "title": "Verify and close the service record",
    "scope": "Check the customer goal, record results and limitations, and reconcile equipment used or received.",
    "evidence": "Outcome and verification are saved; unresolved items remain visible.",
    "level": "proposed"
  },
  {
    "id": "INT-08",
    "cat": "INT",
    "title": "Explain the result to the customer",
    "scope": "Show the relevant setup or operation and describe the next step in plain language.",
    "evidence": "Instructions and any follow-up are recorded; customer demonstration is noted when performed.",
    "level": "core"
  },
  {
    "id": "FWC-01",
    "cat": "FWC",
    "title": "Check firmware eligibility and update path",
    "scope": "Identify the exact device and installed version, then consult current manufacturer instructions for the applicable update route.",
    "evidence": "The source, target, prerequisites, and method are recorded.",
    "level": "discussed"
  },
  {
    "id": "FWC-02",
    "cat": "FWC",
    "title": "Download the correct firmware package",
    "scope": "Obtain the manufacturer package that matches the model and update path and identify it clearly.",
    "evidence": "The package name and official source are linked to the task.",
    "level": "core"
  },
  {
    "id": "FWC-03",
    "cat": "FWC",
    "title": "Perform a card-based firmware update",
    "scope": "Prepare compatible update media and follow the current model-specific procedure within the agreed scope.",
    "evidence": "The camera reports the resulting firmware version, or the exact failure is recorded.",
    "level": "discussed"
  },
  {
    "id": "FWC-04",
    "cat": "FWC",
    "title": "Perform a computer/USB firmware update",
    "scope": "Use the required updater, operating system, connection, and device mode.",
    "evidence": "Updater result and the version reported by the device agree, or the discrepancy is logged.",
    "level": "discussed"
  },
  {
    "id": "FWC-05",
    "cat": "FWC",
    "title": "Perform an app-based firmware update",
    "scope": "Use the supported app and model-specific connection method when the manufacturer provides this route.",
    "evidence": "Completion and the device's resulting version are recorded.",
    "level": "discussed"
  },
  {
    "id": "FWC-06",
    "cat": "FWC",
    "title": "Troubleshoot an update that will not start or finish",
    "scope": "Investigate package selection, prerequisites, media layout, OS compatibility, connection, power, and exact error.",
    "evidence": "Successful retest or a clear escalation with attempted steps is documented.",
    "level": "discussed"
  },
  {
    "id": "FWC-07",
    "cat": "FWC",
    "title": "Run a post-update functional check",
    "scope": "Recheck the original problem and the relevant shooting, recording, connection, or accessory function.",
    "evidence": "An observed functional result is recorded separately from the version number.",
    "level": "proposed"
  },
  {
    "id": "FWA-01",
    "cat": "FWA",
    "title": "Update compatible lens firmware",
    "scope": "Identify the lens variant and supported update method, perform the authorized update, and test its relevant functions.",
    "evidence": "Lens version and observed autofocus/aperture behavior are recorded.",
    "level": "discussed"
  },
  {
    "id": "FWA-02",
    "cat": "FWA",
    "title": "Update an electronic lens adapter",
    "scope": "Identify the exact mount adapter and revision and apply its documented firmware procedure.",
    "evidence": "Adapter version and operation with the recorded camera/lens pair are documented.",
    "level": "discussed"
  },
  {
    "id": "FWA-03",
    "cat": "FWA",
    "title": "Update an external monitor",
    "scope": "Resolve the exact monitor model before selecting firmware and follow its documented procedure.",
    "evidence": "Monitor version and the required display/control functions are checked.",
    "level": "discussed"
  },
  {
    "id": "FWA-04",
    "cat": "FWA",
    "title": "Update a gimbal, handheld camera, or controller",
    "scope": "Identify each component and the supported desktop/app update route; track components individually.",
    "evidence": "Each updated component and relevant connection test are recorded.",
    "level": "discussed"
  },
  {
    "id": "FWA-05",
    "cat": "FWA",
    "title": "Maintain accessory firmware compatibility notes",
    "scope": "Store model-specific requirements and known combinations with their source and review date.",
    "evidence": "A searchable, dated note exists without treating untested combinations as compatible.",
    "level": "proposed"
  },
  {
    "id": "CAM-01",
    "cat": "CAM",
    "title": "Set up basic camera operation",
    "scope": "Help configure the device for the customer's stated photo or video goal and explain the controls used.",
    "evidence": "A representative capture or demonstration meets the stated goal.",
    "level": "core"
  },
  {
    "id": "CAM-02",
    "cat": "CAM",
    "title": "Troubleshoot autofocus",
    "scope": "Check the recorded body/lens/adapter combination and applicable focus settings and behavior.",
    "evidence": "Focus behavior is demonstrated or the remaining fault is isolated for referral.",
    "level": "discussed"
  },
  {
    "id": "CAM-03",
    "cat": "CAM",
    "title": "Configure a manual lens or adapted lens",
    "scope": "Investigate lens recognition, release settings, exposure behavior, and the limits of the actual combination.",
    "evidence": "A test capture documents what functions work and what remains manual.",
    "level": "discussed"
  },
  {
    "id": "CAM-04",
    "cat": "CAM",
    "title": "Investigate disabled menus or recording-media messages",
    "scope": "Identify the camera state, media, and settings associated with unavailable options or error indicators.",
    "evidence": "The menu/function works or the specific restriction is explained.",
    "level": "discussed"
  },
  {
    "id": "CAM-05",
    "cat": "CAM",
    "title": "Investigate power, startup, or intermittent operation",
    "scope": "Compare the supported power source, connections, battery behavior, and externally observable symptoms.",
    "evidence": "Findings identify a reproducible condition or the reason for service referral.",
    "level": "discussed"
  },
  {
    "id": "CAM-06",
    "cat": "CAM",
    "title": "Investigate shutter, mirror, or camera error messages",
    "scope": "Record exact errors and compare relevant modes without presenting unperformed internal repair as a service.",
    "evidence": "The result of a controlled function test and any referral are recorded.",
    "level": "discussed"
  },
  {
    "id": "CAM-07",
    "cat": "CAM",
    "title": "Investigate overheating or unexpected shutdown",
    "scope": "Document operating conditions, mode, timing, installed firmware, and the actual warning.",
    "evidence": "Findings and the next supported action are recorded without an unsupported diagnosis.",
    "level": "discussed"
  },
  {
    "id": "CAM-08",
    "cat": "CAM",
    "title": "Check reported lens alignment or image-quality concerns",
    "scope": "Capture a consistent comparison and record the settings and observations used to assess the complaint.",
    "evidence": "Reference images or findings support the conclusion and any referral.",
    "level": "discussed"
  },
  {
    "id": "CAM-09",
    "cat": "CAM",
    "title": "Teach basic film-camera operation",
    "scope": "Identify the camera and explain applicable battery, loading, winding, release, and rewind operation.",
    "evidence": "The requested operation is demonstrated within the camera's condition and loaded-film constraints.",
    "level": "discussed"
  },
  {
    "id": "MOB-01",
    "cat": "MOB",
    "title": "Set up a camera companion app",
    "scope": "Identify the correct app for the device and guide the supported first connection.",
    "evidence": "The app recognizes the intended camera.",
    "level": "discussed"
  },
  {
    "id": "MOB-02",
    "cat": "MOB",
    "title": "Troubleshoot failed pairing or reconnection",
    "scope": "Inspect saved pairings, relevant device settings, app permissions, and the required connection sequence.",
    "evidence": "Reconnection is demonstrated or the precise failure stage is documented.",
    "level": "discussed"
  },
  {
    "id": "MOB-03",
    "cat": "MOB",
    "title": "Transfer images or video from camera to mobile device",
    "scope": "Select the agreed files and supported transfer method and check the destination.",
    "evidence": "Transferred sample files open on the receiving device.",
    "level": "discussed"
  },
  {
    "id": "MOB-04",
    "cat": "MOB",
    "title": "Set up camera remote control",
    "scope": "Configure supported remote shooting or control and test the requested function.",
    "evidence": "The requested remote action is demonstrated; unsupported actions are identified.",
    "level": "discussed"
  },
  {
    "id": "MOB-05",
    "cat": "MOB",
    "title": "Evaluate a wired phone, camera, or card-reader connection",
    "scope": "Identify connectors, host/device roles, power, and actual data compatibility for the combination.",
    "evidence": "A real transfer or detection test supports the recommendation.",
    "level": "discussed"
  },
  {
    "id": "PC-01",
    "cat": "PC",
    "title": "Set up a new computer",
    "scope": "Complete the agreed initial setup, basic device configuration, and requested operational checks.",
    "evidence": "The user can reach the normal environment and perform the requested basic task.",
    "level": "core"
  },
  {
    "id": "PC-02",
    "cat": "PC",
    "title": "Install or reinstall an operating system",
    "scope": "Confirm target device, edition, installation method, license entitlement, and data scope before the authorized operation.",
    "evidence": "Installation state and basic function are recorded, including any unfinished setup.",
    "level": "discussed"
  },
  {
    "id": "PC-03",
    "cat": "PC",
    "title": "Resolve missing installation drivers or devices",
    "scope": "Investigate storage, keyboard, mouse, and other hardware missing from setup or the installed OS.",
    "evidence": "Required hardware is detected or a specific unresolved dependency is documented.",
    "level": "discussed"
  },
  {
    "id": "PC-04",
    "cat": "PC",
    "title": "Assist with OS edition or activation",
    "scope": "Identify the installed edition and customer's legitimate entitlement and work through the supported activation flow.",
    "evidence": "Activation/edition result is noted without storing a product key.",
    "level": "discussed"
  },
  {
    "id": "PC-05",
    "cat": "PC",
    "title": "Configure operating-system update behavior",
    "scope": "Explain and set the available update options that address the user's request.",
    "evidence": "Selected settings and any relevant limitations are documented.",
    "level": "discussed"
  },
  {
    "id": "PC-06",
    "cat": "PC",
    "title": "Guide account or login recovery",
    "scope": "Help the device owner use the supported recovery process, distinguishing local sign-in from cloud-account credentials.",
    "evidence": "Access is restored or the next official recovery step is documented; secrets are not retained.",
    "level": "discussed"
  },
  {
    "id": "PC-07",
    "cat": "PC",
    "title": "Investigate boot failure or a requested reset",
    "scope": "Identify the device and symptom, preserve the agreed data scope, and use the supported diagnostic or reset route.",
    "evidence": "Boot/reset outcome and data implications are recorded.",
    "level": "discussed"
  },
  {
    "id": "PC-08",
    "cat": "PC",
    "title": "Assess RAM or SSD compatibility and upgrade needs",
    "scope": "Check the exact model, existing configuration, compatibility, and the support requested.",
    "evidence": "Compatible requirements or a referral are documented; physical installation is a separately confirmed service.",
    "level": "discussed"
  },
  {
    "id": "PC-09",
    "cat": "PC",
    "title": "Investigate overheating or cooling symptoms",
    "scope": "Record temperatures/readouts and observed fan/pump behavior using available supported diagnostics.",
    "evidence": "Findings distinguish observations from an unverified failed-component diagnosis.",
    "level": "discussed"
  },
  {
    "id": "PC-10",
    "cat": "PC",
    "title": "Set up or troubleshoot external displays",
    "scope": "Identify ports, adapters, display count, and system capability; test the requested arrangement.",
    "evidence": "The supported display arrangement works or its limiting component is identified.",
    "level": "discussed"
  },
  {
    "id": "PC-11",
    "cat": "PC",
    "title": "Troubleshoot Chromebook file or cloud-drive access",
    "scope": "Inspect the account, network, file-app behavior, and exact error using the supported account flow.",
    "evidence": "Access is restored or the unresolved condition is documented.",
    "level": "discussed"
  },
  {
    "id": "SW-01",
    "cat": "SW",
    "title": "Download requested software or utilities",
    "scope": "Identify a suitable official package for the device, OS, and requested use.",
    "evidence": "The correct installer/source is recorded and accessible for the task.",
    "level": "core"
  },
  {
    "id": "SW-02",
    "cat": "SW",
    "title": "Install or reinstall an application",
    "scope": "Run the agreed installation and complete its required supported configuration.",
    "evidence": "The application launches or its specific installation failure is recorded.",
    "level": "discussed"
  },
  {
    "id": "SW-03",
    "cat": "SW",
    "title": "Check application and operating-system compatibility",
    "scope": "Compare the actual OS/hardware with the relevant vendor requirements.",
    "evidence": "The compatible option or limitation is documented with a source and date.",
    "level": "discussed"
  },
  {
    "id": "SW-04",
    "cat": "SW",
    "title": "Assist with legitimate application activation",
    "scope": "Distinguish installation from license ownership and use the customer's supported activation method.",
    "evidence": "Activation state is documented without retaining license keys or passwords.",
    "level": "discussed"
  },
  {
    "id": "SW-05",
    "cat": "SW",
    "title": "Set up photo-viewing, camera, or device utilities",
    "scope": "Configure the tool needed to view/import files or manage the supported device.",
    "evidence": "A representative file opens or the intended device is recognized.",
    "level": "discussed"
  },
  {
    "id": "SW-06",
    "cat": "SW",
    "title": "Maintain a software and installer reference",
    "scope": "Catalog official sources, supported OS, last review date, access requirements, and package versions used.",
    "evidence": "Staff can find a dated source and identify who maintains the entry.",
    "level": "proposed"
  },
  {
    "id": "DAT-01",
    "cat": "DAT",
    "title": "Copy files between customer storage devices",
    "scope": "Confirm the requested files and destination and perform the agreed transfer.",
    "evidence": "Destination contents and copy results are checked and documented.",
    "level": "core"
  },
  {
    "id": "DAT-02",
    "cat": "DAT",
    "title": "Back up requested files to external storage",
    "scope": "Define the backup scope, check destination capacity, and copy the agreed material.",
    "evidence": "The saved location, scope, errors, and verification result are recorded.",
    "level": "discussed"
  },
  {
    "id": "DAT-03",
    "cat": "DAT",
    "title": "Migrate data between computers",
    "scope": "Plan and perform the supported transfer of agreed accounts, files, and application-related data.",
    "evidence": "Requested content is checked on the new computer; applications/licensing are tracked separately.",
    "level": "discussed"
  },
  {
    "id": "DAT-04",
    "cat": "DAT",
    "title": "Copy Windows profile folders with an appropriate utility",
    "scope": "Select the correct folders and options and track permissions, skips, and copy-log results.",
    "evidence": "The requested data is accounted for, including unresolved access errors.",
    "level": "discussed"
  },
  {
    "id": "DAT-05",
    "cat": "DAT",
    "title": "Download cloud-held files or photos to local storage",
    "scope": "Identify what is actually stored locally versus online and complete the agreed download/export.",
    "evidence": "The intended local files open without relying solely on placeholders.",
    "level": "discussed"
  },
  {
    "id": "DAT-06",
    "cat": "DAT",
    "title": "Transfer data between phones or tablets",
    "scope": "Use the supported device-migration method and monitor its connection and completion state.",
    "evidence": "Agreed data categories are checked on the destination device.",
    "level": "discussed"
  },
  {
    "id": "DAT-07",
    "cat": "DAT",
    "title": "Migrate browser data and identify application reinstall needs",
    "scope": "Separate browser sync/export, ordinary documents, application data, and installed programs.",
    "evidence": "The customer knows what transferred and what still requires installation or sign-in.",
    "level": "discussed"
  },
  {
    "id": "DAT-08",
    "cat": "DAT",
    "title": "Diagnose slow, failed, or interrupted transfers",
    "scope": "Compare the actual connection path, source/destination behavior, workload, and copy errors.",
    "evidence": "The limiting factor is supported by observations or remains explicitly undetermined.",
    "level": "discussed"
  },
  {
    "id": "DAT-09",
    "cat": "DAT",
    "title": "Verify a transfer or migration",
    "scope": "Reconcile copy-tool results with the agreed scope; open representative files and use stronger checks where the job warrants them.",
    "evidence": "The verification method, samples, exceptions, and remaining gaps are recorded.",
    "level": "proposed"
  },
  {
    "id": "REC-01",
    "cat": "REC",
    "title": "Diagnose a drive or card that is not detected",
    "scope": "Compare device enumeration, reader/port/cable behavior, and the recorded disk state without changing the source unnecessarily.",
    "evidence": "Detection findings and tested connection paths are documented.",
    "level": "discussed"
  },
  {
    "id": "REC-02",
    "cat": "REC",
    "title": "Isolate reader, cable, enclosure, or media failure",
    "scope": "Retest with compatible known-good components and record which substitutions change the result.",
    "evidence": "The suspected component is supported by the actual comparison.",
    "level": "discussed"
  },
  {
    "id": "REC-03",
    "cat": "REC",
    "title": "Assess whether recovery software can access the source",
    "scope": "Determine whether the source exposes the storage access the proposed recovery tool requires.",
    "evidence": "Available recovery route or access limitation is recorded.",
    "level": "discussed"
  },
  {
    "id": "REC-04",
    "cat": "REC",
    "title": "Run an authorized recovery scan",
    "scope": "Select the correct source and suitable scan scope, preserving source data and keeping scan details traceable.",
    "evidence": "Scan progress/result and the selected recovery candidates are saved in the log.",
    "level": "discussed"
  },
  {
    "id": "REC-05",
    "cat": "REC",
    "title": "Investigate deleted audio or recorder-internal data",
    "scope": "Identify recorder storage presentation and available recovery access before choosing a method.",
    "evidence": "Recoverability findings are recorded without assuming every recorder exposes its internal memory.",
    "level": "discussed"
  },
  {
    "id": "REC-06",
    "cat": "REC",
    "title": "Export recovered files to a separate destination",
    "scope": "Select appropriate recovery results and write recovered output away from the source being recovered.",
    "evidence": "The destination, recovered counts, tool limitations, and export errors are recorded.",
    "level": "discussed"
  },
  {
    "id": "REC-07",
    "cat": "REC",
    "title": "Check recovered files for actual usability",
    "scope": "Open or play representative recovered files and distinguish a listed filename from valid content.",
    "evidence": "Valid, damaged, duplicate, and unchecked results are described without promising full recovery.",
    "level": "proposed"
  },
  {
    "id": "REC-08",
    "cat": "REC",
    "title": "Format or initialize storage after explicit scope confirmation",
    "scope": "Verify the target and the agreed data-loss consequences before performing the requested operation.",
    "evidence": "The correct device's format/initialization result and any error are documented.",
    "level": "discussed"
  },
  {
    "id": "REC-09",
    "cat": "REC",
    "title": "Handle an encrypted-drive access or wipe request",
    "scope": "Distinguish unlocking with the owner's legitimate key from erasing the drive; use only the requested supported route.",
    "evidence": "Access or erase outcome is recorded without retaining recovery keys.",
    "level": "discussed"
  },
  {
    "id": "REC-10",
    "cat": "REC",
    "title": "Refer a recovery or hardware case beyond available capability",
    "scope": "Document source symptoms, attempted steps, and why continued work or a different service is needed.",
    "evidence": "The referral reason and next action are clear.",
    "level": "proposed"
  },
  {
    "id": "MED-01",
    "cat": "MED",
    "title": "Open or troubleshoot an unfamiliar media file",
    "scope": "Identify the actual file type and determine a supported playback/viewing method.",
    "evidence": "The relevant file opens or the file/compatibility problem is documented.",
    "level": "discussed"
  },
  {
    "id": "MED-02",
    "cat": "MED",
    "title": "Convert an existing video file to the requested format",
    "scope": "Record the source and intended playback target and perform the agreed conversion.",
    "evidence": "Output video, audio, and relevant duration are checked.",
    "level": "discussed"
  },
  {
    "id": "MED-03",
    "cat": "MED",
    "title": "Transfer accessible content from optical media",
    "scope": "Identify readable disc contents and copy/export the agreed material to the requested storage.",
    "evidence": "Selected content is present and playable/readable at the destination.",
    "level": "discussed"
  },
  {
    "id": "MED-04",
    "cat": "MED",
    "title": "Assess a tape or legacy-video conversion request",
    "scope": "Identify the tape format, available playback/capture hardware, desired output, and whether GTS can perform the work.",
    "evidence": "A concrete transfer path or referral is documented; capture service availability remains explicit.",
    "level": "discussed"
  },
  {
    "id": "MED-05",
    "cat": "MED",
    "title": "Organize delivered media files",
    "scope": "Place recovered, copied, or converted files into the agreed folder structure without silently replacing originals.",
    "evidence": "The customer-facing delivery location and naming are clear.",
    "level": "proposed"
  },
  {
    "id": "AUD-01",
    "cat": "AUD",
    "title": "Pair wireless microphone transmitters and receivers",
    "scope": "Identify the kit and establish the supported transmitter/receiver connection.",
    "evidence": "The intended transmitters appear connected and produce a test signal.",
    "level": "discussed"
  },
  {
    "id": "AUD-02",
    "cat": "AUD",
    "title": "Connect a microphone receiver to a camera",
    "scope": "Identify the receiver output, camera input, cable, and relevant input configuration.",
    "evidence": "A camera recording contains intelligible test audio on the intended channel.",
    "level": "discussed"
  },
  {
    "id": "AUD-03",
    "cat": "AUD",
    "title": "Connect a microphone to a phone or computer",
    "scope": "Verify the actual digital/analog connection and adapter requirements for the host.",
    "evidence": "A recording in the intended host app confirms recognition and usable audio.",
    "level": "discussed"
  },
  {
    "id": "AUD-04",
    "cat": "AUD",
    "title": "Troubleshoot missing, distorted, or incorrect-channel audio",
    "scope": "Trace the signal from source through transmitter, receiver, cable, host input, and playback.",
    "evidence": "The failing stage is identified or a successful recording demonstrates the fix.",
    "level": "discussed"
  },
  {
    "id": "AUD-05",
    "cat": "AUD",
    "title": "Set up a handheld or voice recorder",
    "scope": "Explain the requested recording controls, storage choice, playback, and supported connection.",
    "evidence": "A test recording saves and plays as expected.",
    "level": "discussed"
  },
  {
    "id": "AUD-06",
    "cat": "AUD",
    "title": "Transfer recordings to customer storage",
    "scope": "Identify the accessible recording location and copy/export the agreed files.",
    "evidence": "The destination recordings play; internal-memory access limitations are documented.",
    "level": "discussed"
  },
  {
    "id": "AUD-07",
    "cat": "AUD",
    "title": "Set up an audio-device companion app",
    "scope": "Identify the model's supported app and available connection/settings workflow.",
    "evidence": "The app detects the appropriate device or its limitation is recorded.",
    "level": "discussed"
  },
  {
    "id": "LGT-01",
    "cat": "LGT",
    "title": "Set up an on-camera flash",
    "scope": "Check the exact camera/flash combination and requested operating mode.",
    "evidence": "A captured image confirms the intended flash contribution.",
    "level": "discussed"
  },
  {
    "id": "LGT-02",
    "cat": "LGT",
    "title": "Check radio trigger compatibility",
    "scope": "Identify the actual radio ecosystem and supported combination instead of assuming devices communicate because connectors fit.",
    "evidence": "Compatibility finding and its source or observed test are recorded.",
    "level": "discussed"
  },
  {
    "id": "LGT-03",
    "cat": "LGT",
    "title": "Set channels, groups, and applicable wireless IDs",
    "scope": "Configure the available controls on the actual transmitter/receiver combination.",
    "evidence": "Matching settings and a relevant trigger test are documented.",
    "level": "discussed"
  },
  {
    "id": "LGT-04",
    "cat": "LGT",
    "title": "Set up an off-camera flash or strobe",
    "scope": "Connect the supported triggering arrangement and test the intended light.",
    "evidence": "The camera triggers the intended unit during an exposure.",
    "level": "discussed"
  },
  {
    "id": "LGT-05",
    "cat": "LGT",
    "title": "Diagnose a flash that does not fire or synchronize",
    "scope": "Compare test-button firing, camera-triggered firing, settings, power, and captured results.",
    "evidence": "The failing stage is identified or synchronized capture is demonstrated.",
    "level": "discussed"
  },
  {
    "id": "LGT-06",
    "cat": "LGT",
    "title": "Explain pre-flash or unusual flash behavior",
    "scope": "Identify the active mode and actual sequence and explain or adjust it within supported settings.",
    "evidence": "The behavior and selected mode are documented with a capture test when appropriate.",
    "level": "discussed"
  },
  {
    "id": "VID-01",
    "cat": "VID",
    "title": "Connect an external monitor for an image",
    "scope": "Identify the camera output, monitor input, cable, and relevant signal configuration.",
    "evidence": "A usable picture appears or the exact signal failure is recorded.",
    "level": "discussed"
  },
  {
    "id": "VID-02",
    "cat": "VID",
    "title": "Set up monitor-to-camera control",
    "scope": "Identify the supported wired or wireless control method and guide the customer through the device's connection process.",
    "evidence": "The requested control works; credentials remain on the customer's device.",
    "level": "discussed"
  },
  {
    "id": "VID-03",
    "cat": "VID",
    "title": "Set up and balance a gimbal",
    "scope": "Identify the camera/lens payload and supported mounting/balancing procedure within the actual equipment's limits.",
    "evidence": "The balanced setup operates during an appropriate stationary function check.",
    "level": "discussed"
  },
  {
    "id": "VID-04",
    "cat": "VID",
    "title": "Connect gimbal controls to a camera",
    "scope": "Identify the supported cable or wireless link and test the requested camera controls.",
    "evidence": "Supported controls are demonstrated; unavailable functions are identified.",
    "level": "discussed"
  },
  {
    "id": "VID-05",
    "cat": "VID",
    "title": "Assist with drone/controller/app setup",
    "scope": "Identify the exact aircraft/controller/phone combination and supported linking/setup process.",
    "evidence": "Connection/setup outcome is recorded; an in-store setup check does not claim a flight test.",
    "level": "discussed"
  },
  {
    "id": "VID-06",
    "cat": "VID",
    "title": "Connect a handheld video device to an audio accessory",
    "scope": "Configure the supported pairing or connection and verify it through a recording.",
    "evidence": "The test clip contains the intended audio.",
    "level": "discussed"
  },
  {
    "id": "VID-07",
    "cat": "VID",
    "title": "Set up a teleprompter or video mounting accessory",
    "scope": "Identify the physical setup, requested app/display use, and compatibility of the actual combination.",
    "evidence": "The requested demonstration works or the constraint is documented.",
    "level": "discussed"
  },
  {
    "id": "VID-08",
    "cat": "VID",
    "title": "Connect wearable display glasses",
    "scope": "Identify host video-output capability, cable path, power, and device controls.",
    "evidence": "A working display or the unsupported connection condition is documented.",
    "level": "discussed"
  },
  {
    "id": "PRN-01",
    "cat": "PRN",
    "title": "Connect a photo printer to a phone",
    "scope": "Set up the supported app/connection method for the requested print workflow.",
    "evidence": "The phone reaches the correct printer and a print result or precise failure is recorded.",
    "level": "discussed"
  },
  {
    "id": "PRN-02",
    "cat": "PRN",
    "title": "Diagnose printer paper or ink mismatch",
    "scope": "Identify the printer and actual paper/ink cassette sizes and installation state.",
    "evidence": "The mismatch is resolved or the required compatible consumable is identified.",
    "level": "discussed"
  },
  {
    "id": "PRN-03",
    "cat": "PRN",
    "title": "Teach radio, clock, and alarm operation",
    "scope": "Explain the requested time/date, station, alarm, enable/disable, and stop controls for the exact model.",
    "evidence": "The desired settings and a relevant demonstration are documented.",
    "level": "discussed"
  },
  {
    "id": "PRN-04",
    "cat": "PRN",
    "title": "Explain a wearable or small-device setting",
    "scope": "Locate the actual available setting and explain its behavior and limitations.",
    "evidence": "The setting is demonstrated or its non-configurable limit is documented.",
    "level": "discussed"
  },
  {
    "id": "PRN-05",
    "cat": "PRN",
    "title": "Evaluate cable, adapter, and power compatibility",
    "scope": "Record connector ends and intended function, then check data, video, audio, and power support relevant to that request.",
    "evidence": "The connection recommendation is supported by a source or test.",
    "level": "discussed"
  },
  {
    "id": "RES-01",
    "cat": "RES",
    "title": "Find the correct product manual or support instructions",
    "scope": "Resolve the exact model and locate the relevant manufacturer documentation.",
    "evidence": "A source and the relevant procedure/topic are saved.",
    "level": "discussed"
  },
  {
    "id": "RES-02",
    "cat": "RES",
    "title": "Research a requested device combination",
    "scope": "Evaluate the specific models and intended function and record supported, unsupported, or unverified status.",
    "evidence": "The answer is tied to the actual combination and evidence.",
    "level": "discussed"
  },
  {
    "id": "RES-03",
    "cat": "RES",
    "title": "Research product availability or discontinuation",
    "scope": "Check the available current retailer/manufacturer statements and distinguish unavailability from a confirmed discontinuation.",
    "evidence": "The source, date, and limits of the conclusion are recorded.",
    "level": "discussed"
  },
  {
    "id": "RES-04",
    "cat": "RES",
    "title": "Explain gray-market or support-coverage questions",
    "scope": "Explain the applicable seller/manufacturer information for the actual product and request.",
    "evidence": "The explanation identifies its source and does not invent warranty coverage.",
    "level": "discussed"
  },
  {
    "id": "RES-05",
    "cat": "RES",
    "title": "Locate a repair or manufacturer-support route",
    "scope": "Identify a suitable service contact for the product and issue and record how its scope was checked.",
    "evidence": "The customer has a concrete referral and the reason for referral.",
    "level": "discussed"
  },
  {
    "id": "RES-06",
    "cat": "RES",
    "title": "Write simple customer instructions",
    "scope": "Turn the verified device workflow into clear, short steps the customer can follow.",
    "evidence": "A reusable draft is saved with the relevant model and procedure date.",
    "level": "discussed"
  },
  {
    "id": "RES-07",
    "cat": "RES",
    "title": "Document a service escalation",
    "scope": "Summarize the issue, tests, evidence, requested help, and next owner.",
    "evidence": "The escalation can be understood without reopening the full investigation.",
    "level": "proposed"
  },
  {
    "id": "INV-01",
    "cat": "INV",
    "title": "Create and reconcile the station equipment register",
    "scope": "Identify actual assets, record location/condition/capability, and reconcile the count against what is physically present.",
    "evidence": "Each counted item has a traceable record; unknowns remain unknown.",
    "level": "proposed"
  },
  {
    "id": "INV-02",
    "cat": "INV",
    "title": "Label and organize cables, readers, adapters, and tools",
    "scope": "Group equipment by useful capability and identify its home location.",
    "evidence": "Staff can locate a labeled item and return it to a defined place.",
    "level": "proposed"
  },
  {
    "id": "INV-03",
    "cat": "INV",
    "title": "Check reusable equipment out to a job or technician",
    "scope": "Reserve or assign the specific asset or counted reusable quantity to its current use.",
    "evidence": "Availability, holder, location, and related job are recorded.",
    "level": "proposed"
  },
  {
    "id": "INV-04",
    "cat": "INV",
    "title": "Return and check equipment after use",
    "scope": "Record the return, condition, missing pieces, and whether it is ready for the next task.",
    "evidence": "The item is either available again or visibly blocked for a stated reason.",
    "level": "proposed"
  },
  {
    "id": "INV-05",
    "cat": "INV",
    "title": "Track consumable receipts and usage",
    "scope": "Record actual received, used, wasted, or adjusted quantities with units and reasons.",
    "evidence": "The stock balance can be reconciled to its movement history.",
    "level": "proposed"
  },
  {
    "id": "INV-06",
    "cat": "INV",
    "title": "Flag damaged, unreliable, or missing equipment",
    "scope": "Identify the affected item and its observed fault and remove it from available stock until resolved.",
    "evidence": "The issue has an owner and disposition without silently deleting the item.",
    "level": "proposed"
  },
  {
    "id": "INV-07",
    "cat": "INV",
    "title": "Track customer equipment received for a job",
    "scope": "When equipment is left with the team, record individual devices/accessories, condition, location, and handoff/return events.",
    "evidence": "Every received item is accounted for; counter-only jobs can mark custody not taken.",
    "level": "proposed"
  },
  {
    "id": "INV-08",
    "cat": "INV",
    "title": "Check workstation and station readiness",
    "scope": "Check the agreed computer, reader, cable, storage-capacity, software-access, and workspace conditions before work starts.",
    "evidence": "Failures are logged as actionable station issues.",
    "level": "proposed"
  },
  {
    "id": "INV-09",
    "cat": "INV",
    "title": "Clean and reset the work area",
    "scope": "Return shared accessories, organize the surface, and perform the agreed station-cleaning tasks.",
    "evidence": "The station is ready for the next technician and exceptions are recorded.",
    "level": "proposed"
  },
  {
    "id": "INV-10",
    "cat": "INV",
    "title": "Track workstation permissions or software-access requests",
    "scope": "Record a blocked service, the requested capability, current owner, and resolution through existing company channels.",
    "evidence": "The blocker remains visible until access is available or an alternative is documented.",
    "level": "proposed"
  },
  {
    "id": "INV-11",
    "cat": "INV",
    "title": "Reconcile stock and replenishment needs",
    "scope": "Perform a scheduled or triggered physical check and compare actual stock with configurable levels.",
    "evidence": "Variances and proposed replenishment are recorded; orders are separate actions.",
    "level": "proposed"
  },
  {
    "id": "KNW-01",
    "cat": "KNW",
    "title": "Create a reusable troubleshooting procedure",
    "scope": "Convert a repeatable, verified workflow into prerequisites, steps, expected results, and escalation guidance.",
    "evidence": "The article has an owner, source evidence, scope, and review state.",
    "level": "proposed"
  },
  {
    "id": "KNW-02",
    "cat": "KNW",
    "title": "Save a solved-case lesson",
    "scope": "Capture symptoms, tests, verified finding, actual fix, validation, and a concise lesson.",
    "evidence": "The lesson is linked to its source case and searchable by product and symptom.",
    "level": "proposed"
  },
  {
    "id": "KNW-03",
    "cat": "KNW",
    "title": "Maintain a shared shift-handoff view",
    "scope": "Summarize unfinished jobs, running transfers/scans, reserved equipment, and blockers for the incoming staff.",
    "evidence": "Each open item has an owner and next action.",
    "level": "proposed"
  },
  {
    "id": "KNW-04",
    "cat": "KNW",
    "title": "Track training and procedure review",
    "scope": "Record a topic, reviewer/learner, demonstration, and required follow-up without assuming formal certification.",
    "evidence": "Completion or outstanding practice is recorded.",
    "level": "proposed"
  },
  {
    "id": "KNW-05",
    "cat": "KNW",
    "title": "Maintain the GTS hub improvement backlog",
    "scope": "Record workflow problems, proposed changes, expected benefit, owner, and evidence of the result.",
    "evidence": "Each project has a next step and measurable completion criterion.",
    "level": "proposed"
  }
];

export const INVENTORY_TYPES = [
  {
    "id": "workstation",
    "name": "Workstations and test computers",
    "examples": [
      "Windows workstation",
      "Mac workstation",
      "test laptop"
    ],
    "tracking": "serialized_asset",
    "attributes": [
      "Asset tag",
      "OS/build",
      "available ports",
      "working storage capacity",
      "installed approved utilities",
      "location",
      "condition"
    ]
  },
  {
    "id": "usb_cable",
    "name": "USB and device-data cables",
    "examples": [
      "USB-A to USB-C",
      "USB-C to USB-C",
      "Micro-USB",
      "model-specific camera cable"
    ],
    "tracking": "serialized_asset_or_counted_reusable",
    "attributes": [
      "Connector A/B",
      "length",
      "data capability",
      "power rating if known",
      "video capability if known",
      "verified use",
      "bin"
    ]
  },
  {
    "id": "video_cable",
    "name": "Video and camera-control cables",
    "examples": [
      "HDMI",
      "mini/micro HDMI",
      "DisplayPort",
      "camera-control cable"
    ],
    "tracking": "serialized_asset_or_counted_reusable",
    "attributes": [
      "Connector A/B",
      "supported function",
      "length",
      "model compatibility",
      "test state"
    ]
  },
  {
    "id": "audio_cable",
    "name": "Audio cables and audio/mobile adapters",
    "examples": [
      "3.5 mm audio cable",
      "camera audio cable",
      "supported mobile microphone adapter"
    ],
    "tracking": "serialized_asset_or_counted_reusable",
    "attributes": [
      "Connector/wiring type",
      "analog/digital function",
      "host/device compatibility",
      "verified combination"
    ]
  },
  {
    "id": "reader",
    "name": "Memory-card readers",
    "examples": [
      "SD/microSD reader",
      "CFexpress Type A reader",
      "CFexpress Type B reader",
      "legacy-media reader"
    ],
    "tracking": "serialized_asset",
    "attributes": [
      "Supported card standard",
      "host connector",
      "interface capability",
      "known-good state",
      "location"
    ]
  },
  {
    "id": "adapter",
    "name": "Hubs, docks, enclosures, and adapters",
    "examples": [
      "USB hub",
      "SSD enclosure",
      "display adapter",
      "phone/card adapter"
    ],
    "tracking": "serialized_asset",
    "attributes": [
      "Ports",
      "power needs",
      "supported media/protocol",
      "host requirements",
      "verified combinations"
    ]
  },
  {
    "id": "working_storage",
    "name": "GTS test and working storage",
    "examples": [
      "Test memory card",
      "working SSD",
      "installation USB",
      "firmware-update card"
    ],
    "tracking": "serialized_asset",
    "attributes": [
      "Capacity",
      "media type",
      "purpose",
      "reservation",
      "content state",
      "last cleared/checked date"
    ]
  },
  {
    "id": "power",
    "name": "Power and charging equipment",
    "examples": [
      "Chargers",
      "compatible power supplies",
      "test batteries"
    ],
    "tracking": "serialized_asset_or_counted_reusable",
    "attributes": [
      "Voltage/current or power specification",
      "connector/polarity where relevant",
      "compatible models",
      "charge/condition",
      "location"
    ]
  },
  {
    "id": "test_equipment",
    "name": "Test accessories and setup tools",
    "examples": [
      "Known-good lens",
      "flash/trigger",
      "microphone",
      "headphones",
      "mount or hand tool"
    ],
    "tracking": "serialized_asset",
    "attributes": [
      "Make/model",
      "included pieces",
      "compatibility",
      "condition",
      "holder",
      "return state"
    ]
  },
  {
    "id": "consumable",
    "name": "Consumables",
    "examples": [
      "Printer paper/ink",
      "labels",
      "cable ties",
      "approved cleaning supplies"
    ],
    "tracking": "counted_consumable",
    "attributes": [
      "SKU/type",
      "unit of measure",
      "quantity on hand",
      "minimum level if set",
      "compatible printer/device",
      "location"
    ]
  },
  {
    "id": "software",
    "name": "Software resources and approved access",
    "examples": [
      "Official installer reference",
      "firmware updater",
      "recovery utility",
      "copy utility"
    ],
    "tracking": "software_resource",
    "attributes": [
      "Version",
      "OS support",
      "official URL",
      "review date",
      "license/access status",
      "permitted station or seats if known"
    ]
  },
  {
    "id": "customer_item",
    "name": "Customer devices and accessories in custody",
    "examples": [
      "Camera",
      "lens",
      "computer",
      "drive",
      "card",
      "customer cable/battery"
    ],
    "tracking": "job_custody",
    "attributes": [
      "Related job",
      "item description",
      "serial or temporary item ID",
      "received condition",
      "included accessories",
      "location",
      "received/returned event"
    ]
  }
];

export const PROJECT_TEMPLATES = [
  {
    "id": "PROJ-01",
    "name": "GTS log and inventory app",
    "deliverable": "Working shared job log, assignments, inventory movements, handoff view, and searchable procedures",
    "done": "Staff can create, assign, update, hand off, and close a job and account for the equipment it used."
  },
  {
    "id": "PROJ-02",
    "name": "Station accessory organization",
    "deliverable": "Actual equipment register, labels, capability descriptions, and home locations",
    "done": "A physical count reconciles with the register and staff can find/return the required accessories."
  },
  {
    "id": "PROJ-03",
    "name": "Workstation and transfer bottleneck review",
    "deliverable": "Repeatable observations of common job workloads and their resource constraints",
    "done": "The team can identify measured bottlenecks and document the result of a chosen improvement."
  },
  {
    "id": "PROJ-04",
    "name": "Firmware and installer reference",
    "deliverable": "Searchable official sources, model/OS requirements, owners, and verification dates",
    "done": "Common tools and update instructions can be found and their applicability checked."
  },
  {
    "id": "PROJ-05",
    "name": "Transfer and recovery job templates",
    "deliverable": "Short templates for source/destination, scope, progress, blockers, and validation",
    "done": "Another technician can safely understand and continue a running transfer or recovery job from its record."
  },
  {
    "id": "PROJ-06",
    "name": "Compatibility and known-good equipment reference",
    "deliverable": "Records of exact tested combinations, sources, limitations, and available test accessories",
    "done": "Staff can distinguish verified, documented, failed, and untested combinations."
  },
  {
    "id": "PROJ-07",
    "name": "SOP and customer-instruction collection",
    "deliverable": "Reviewed procedures and concise customer-facing instructions drawn from verified cases",
    "done": "A technician can locate the applicable current procedure by model and problem."
  },
  {
    "id": "PROJ-08",
    "name": "Handoff and recurring station checklist",
    "deliverable": "Open-work view plus configurable opening, closing, and stock-review templates",
    "done": "Every unfinished job has an owner/next action and scheduled checks generate actionable exceptions."
  }
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const ASSIGNMENT_BY_ID = Object.fromEntries(ASSIGNMENT_TYPES.map((a) => [a.id, a]));

export function assignmentsForCategory(catId) {
  return ASSIGNMENT_TYPES.filter((a) => a.cat === catId);
}

/** Full-text search across id, title, scope, evidence and category name. */
export function searchCatalog(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return ASSIGNMENT_TYPES;
  const terms = q.split(/\s+/);
  return ASSIGNMENT_TYPES.filter((a) => {
    const hay = `${a.id} ${a.title} ${a.scope} ${a.evidence} ${CATEGORY_BY_ID[a.cat]?.name || ''}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
