/**
 * Windows ABI constants for the ACL-sandbox backend.
 *
 * Every value was verified against the actual MinGW Windows headers on this
 * machine (C:\Strawberry\c\x86_64-w64-mingw32\include\) and cross-checked at
 * runtime by verify/abi-probe.cpp (same numbers; static_asserts passed).
 * Regenerate the probe with:
 *   g++ -std=c++20 -municode -O2 -o abi-probe.exe abi-probe.cpp -ladvapi32 && .\abi-probe.exe
 *
 * The port intentionally excludes two pieces of the original POC
 * (github.com/huoyaoyuan/windows-acl-restrict-poc @ 10e4dfb), both verified
 * empirically on Windows 11 build 26200:
 *  - S-1-2-1 (console logon SID) in the restricting list: the POC created it
 *    via CreateWellKnownSid(WinLocalLogonSid) which fails here with
 *    ERROR_INVALID_PARAMETER (87), leaving a garbage SID that makes
 *    CreateRestrictedToken fail with ERROR_INVALID_SID (1337); using the
 *    correct WinConsoleLogonSid does produce a valid S-1-2-1, but the child
 *    then still dies with STATUS_DLL_INIT_FAILED (0xC0000142) whenever
 *    CREATE_NO_WINDOW / CREATE_NEW_CONSOLE is used.
 *  - Console isolation: under this restriction scheme a hidden console is not
 *    attainable, so children share the host console (stdio redirection is
 *    pipe-based and unaffected).
 * @module @freddie/freddie-sandbox-windows-acl/win32-abi
 */

/** TOKEN_ASSIGN_PRIMARY: required to create a process with the token (CreateProcessAsUser). */
export const TOKEN_ASSIGN_PRIMARY = 0x0001
/** TOKEN_DUPLICATE: required to duplicate a token (DuplicateTokenEx). */
export const TOKEN_DUPLICATE = 0x0002
/** TOKEN_QUERY: required to read token information (GetTokenInformation). */
export const TOKEN_QUERY = 0x0008
/** TOKEN_ADJUST_DEFAULT: required to change a token's default DACL. */
export const TOKEN_ADJUST_DEFAULT = 0x0080

/**
 * SE_GROUP_LOGON_ID: marks a token group SID as the logon SID (compared with
 * `>>> 0` — the flag's high bit makes it negative as a signed 32-bit number).
 */
export const SE_GROUP_LOGON_ID = 0xC0000000

/** STANDARD_RIGHTS_WRITE (== READ_CONTROL): the standard-rights component of generic write access. */
export const STANDARD_RIGHTS_WRITE = 0x00020000
/** FILE_GENERIC_WRITE: every file-write permission bit plus SYNCHRONIZE. */
export const FILE_GENERIC_WRITE = 0x00120116
/** DELETE: remove or rename the object (winnt.h line ~3009). */
export const DELETE = 0x00010000
/** FILE_DELETE_CHILD: remove or rename a directory's children (winnt.h line ~5907). */
export const FILE_DELETE_CHILD = 0x0040
/**
 * GRANT_MASK: FILE_GENERIC_WRITE minus READ_CONTROL plus DELETE and
 * FILE_DELETE_CHILD — the write+delete access mask the capability-SID ACEs grant
 * (displays as "Modify" in Explorer/icacls). WRITE_DAC/WRITE_OWNER are
 * deliberately excluded: they would let the confined child take ownership or
 * rewrite DACLs.
 */
export const GRANT_MASK = (FILE_GENERIC_WRITE | DELETE | FILE_DELETE_CHILD) & ~STANDARD_RIGHTS_WRITE

/**
 * FILE_ALL_ACCESS (winnt.h line ~2789: STANDARD_RIGHTS_REQUIRED | SYNCHRONIZE
 * | 0x1FF): full file-object access. The mask of the ACE merged into the
 * restricted token's DEFAULT DACL — the token holder must keep full access to
 * every NEW object it creates (pipes included), and the ACE must name a
 * restricting SID so the write pass-2 check passes at creation.
 */
export const FILE_ALL_ACCESS = 0x1F01FF

/** DISABLE_MAX_PRIVILEGE: strip the token's maximum-privilege elevation so the confined child cannot escalate. */
export const DISABLE_MAX_PRIVILEGE = 0x1
/** LUA_TOKEN: produce a limited-user (filtered admin) token. */
export const LUA_TOKEN = 0x4
/** WRITE_RESTRICTED: intersect write access with the restricting SIDs' ACL grants — the sandbox's core mechanism. */
export const WRITE_RESTRICTED = 0x8

/** WinWorldSid: S-1-1-0 (Everyone) — the only well-known SID the restricted tokens use (keep-alive group; see token.ts). */
export const WinWorldSid = 1

/** TokenGroups: GetTokenInformation class returning the token's group SIDs. */
export const TokenGroups = 2
/** TokenDefaultDacl: the token's default DACL — the DACL every NEW object created without an explicit SD takes. */
export const TokenDefaultDacl = 6

/** DACL_SECURITY_INFORMATION: read/write only the DACL of a security descriptor. */
export const DACL_SECURITY_INFORMATION = 0x00000004

/** PROCESS_QUERY_INFORMATION: read exit status and times of a process handle. */
export const PROCESS_QUERY_INFORMATION = 0x0400

/** SE_FILE_OBJECT: the trustee path names a filesystem object. */
export const SE_FILE_OBJECT = 1

/** TRUSTEE_IS_UNKNOWN: TRUSTEE_TYPE unknown (TrusteeForm carries the shape). */
export const TRUSTEE_IS_UNKNOWN = 0
/** TRUSTEE_IS_SID: TRUSTEE_FORM — Trustee.ptstrName is a SID pointer. */
export const TRUSTEE_IS_SID = 0
/** NO_MULTIPLE_TRUSTEE: Trustee.pMultipleTrustee is null. */
export const NO_MULTIPLE_TRUSTEE = 0

/** GRANT_ACCESS: SetEntriesInAclW adds the entry as an allow ACE. */
export const GRANT_ACCESS = 1
/** REVOKE_ACCESS: SetEntriesInAclW removes the matching allow ACE. */
export const REVOKE_ACCESS = 4

/**
 * SUB_CONTAINERS_AND_OBJECTS_INHERIT: the ACE applies to the directory, its
 * subdirectories, and files (OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE).
 */
export const SUB_CONTAINERS_AND_OBJECTS_INHERIT = 0x3

/**
 * STARTF_USESTDHANDLES: STARTUPINFOW dwFlags — the child uses the hStd*
 * handles, required because Node clears stdio inheritability at startup.
 */
export const STARTF_USESTDHANDLES = 0x00000100
/** HANDLE_FLAG_INHERIT: SetHandleInformation flag re-enabling handle inheritance for the spawned child's stdio handles. */
export const HANDLE_FLAG_INHERIT = 0x1
/** INFINITE: never-timeout wait value. */
export const INFINITE = 0xFFFFFFFF
/** MAX_PATH: legacy path length bound. */
export const MAX_PATH = 260
/** CREATE_SUSPENDED: create the child with its primary thread suspended until ResumeThread. */
export const CREATE_SUSPENDED = 0x4
/** STD_INPUT_HANDLE: GetStdHandle selector for the standard input. */
export const STD_INPUT_HANDLE = -10
/** STD_OUTPUT_HANDLE: GetStdHandle selector for the standard output. */
export const STD_OUTPUT_HANDLE = -11
/** STD_ERROR_HANDLE: GetStdHandle selector for the standard error. */
export const STD_ERROR_HANDLE = -12

/** FORMAT_MESSAGE_FROM_SYSTEM: format the message from the system message table. */
export const FORMAT_MESSAGE_FROM_SYSTEM = 0x00001000
/** FORMAT_MESSAGE_IGNORE_INSERTS: skip insert-sequence substitution. */
export const FORMAT_MESSAGE_IGNORE_INSERTS = 0x00000200

/** ERROR_SUCCESS: the operation succeeded. */
export const ERROR_SUCCESS = 0
/** ERROR_INSUFFICIENT_BUFFER: a size-probe call succeeded but needs a larger buffer. */
export const ERROR_INSUFFICIENT_BUFFER = 122
/** ERROR_BROKEN_PIPE: the pipe's other end has closed. */
export const ERROR_BROKEN_PIPE = 109
/** ERROR_NO_DATA: the pipe is being closed. */
export const ERROR_NO_DATA = 232
/** ERROR_LOCK_VIOLATION: a byte-range lock conflicts with an existing lock (winerror.h line ~78). */
export const ERROR_LOCK_VIOLATION = 33

/** GENERIC_READ: generic read access (winnt.h line ~3028). */
export const GENERIC_READ = 0x80000000
/** GENERIC_WRITE: generic write access (winnt.h line ~3029). */
export const GENERIC_WRITE = 0x40000000
/** FILE_SHARE_READ: other opens may read (winnt.h line ~5949). */
export const FILE_SHARE_READ = 0x00000001
/** FILE_SHARE_WRITE: other opens may write (winnt.h line ~5950). */
export const FILE_SHARE_WRITE = 0x00000002
/** FILE_SHARE_DELETE: other opens may delete (winnt.h line ~5951) — deliberately NOT used for lock files. */
export const FILE_SHARE_DELETE = 0x00000004
/** OPEN_ALWAYS: create the lock file if absent, open it otherwise (fileapi.h line ~21). */
export const OPEN_ALWAYS = 4
/** LOCKFILE_EXCLUSIVE_LOCK: request an exclusive byte-range lock. */
export const LOCKFILE_EXCLUSIVE_LOCK = 0x2
/** LOCKFILE_FAIL_IMMEDIATELY: fail with ERROR_LOCK_VIOLATION instead of waiting. */
export const LOCKFILE_FAIL_IMMEDIATELY = 0x1

/** ACCESS_ALLOWED_ACE_TYPE: an access-allowed ACE granting the mask to the trustee. */
export const ACCESS_ALLOWED_ACE_TYPE = 0

/** SID_MAX_SUB_AUTHORITIES: the most subauthorities a SID may carry. */
export const SID_MAX_SUB_AUTHORITIES = 15

/** INHERITED_ACE: the ACE was inherited from the parent object, not stored explicitly. */
export const INHERITED_ACE = 0x10

/** JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: the child dies when the runner's last job handle closes — the orphan-child backstop. */
export const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
/** JobObjectExtendedLimitInformation: JOBOBJECTINFOCLASS for the extended limit structure. */
export const JobObjectExtendedLimitInformation = 9
/** sizeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION), verified by abi-probe. */
export const JOBOBJECT_EXTENDED_LIMIT_SIZE = 144
/**
 * LimitFlags offset inside JOBOBJECT_EXTENDED_LIMIT_INFORMATION
 * (BasicLimitInformation@0 + PerProcessUserTimeLimit@0 +
 * PerJobUserTimeLimit@8), verified by abi-probe.
 */
export const JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET = 16

/** SECURITY_MAX_SID_SIZE: maximum SID byte size. */
export const SECURITY_MAX_SID_SIZE = 68
/** SID_AND_ATTRIBUTES stride: { PSID Sid @0 (8); DWORD Attributes @8 (4) } + pad. */
export const SID_AND_ATTRIBUTES_SIZE = 16
/** TOKEN_GROUPS.Groups[] starts at offset 8 (GroupCount @0 + alignment). */
export const TOKEN_GROUPS_OFFSET = 8
/** sizeof(EXPLICIT_ACCESS_W): perms@0 mode@4 inheritance@8 Trustee@16. */
export const EXPLICIT_ACCESS_W_SIZE = 48
/** Trustee offset inside EXPLICIT_ACCESS_W. */
export const TRUSTEE_W_OFFSET = 16
/** ptstrName offset inside TRUSTEE_W (=> 40 inside EXPLICIT_ACCESS_W). */
export const TRUSTEE_W_PTSTRNAME_OFFSET = 24
/** sizeof(STARTUPINFOW), verified by abi-probe. */
export const STARTUPINFOW_SIZE = 104
/** sizeof(PROCESS_INFORMATION), verified by abi-probe. */
export const PROCESS_INFORMATION_SIZE = 24
