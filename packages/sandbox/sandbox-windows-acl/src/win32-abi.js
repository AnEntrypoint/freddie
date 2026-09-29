export const TOKEN_ASSIGN_PRIMARY = 0x0001
export const TOKEN_DUPLICATE = 0x0002
export const TOKEN_QUERY = 0x0008
export const TOKEN_ADJUST_DEFAULT = 0x0080

export const SE_GROUP_LOGON_ID = 0xC0000000

export const STANDARD_RIGHTS_WRITE = 0x00020000
export const FILE_GENERIC_WRITE = 0x00120116
export const DELETE = 0x00010000
export const FILE_DELETE_CHILD = 0x0040
export const GRANT_MASK = (FILE_GENERIC_WRITE | DELETE | FILE_DELETE_CHILD) & ~STANDARD_RIGHTS_WRITE

export const FILE_ALL_ACCESS = 0x1F01FF

export const DISABLE_MAX_PRIVILEGE = 0x1
export const LUA_TOKEN = 0x4
export const WRITE_RESTRICTED = 0x8

export const WinWorldSid = 1

export const TokenGroups = 2
export const TokenDefaultDacl = 6

export const DACL_SECURITY_INFORMATION = 0x00000004

export const PROCESS_QUERY_INFORMATION = 0x0400

export const SE_FILE_OBJECT = 1

export const TRUSTEE_IS_UNKNOWN = 0
export const TRUSTEE_IS_SID = 0
export const NO_MULTIPLE_TRUSTEE = 0

export const GRANT_ACCESS = 1
export const REVOKE_ACCESS = 4

export const SUB_CONTAINERS_AND_OBJECTS_INHERIT = 0x3

export const STARTF_USESTDHANDLES = 0x00000100
export const HANDLE_FLAG_INHERIT = 0x1
export const INFINITE = 0xFFFFFFFF
export const MAX_PATH = 260
export const CREATE_SUSPENDED = 0x4
export const STD_INPUT_HANDLE = -10
export const STD_OUTPUT_HANDLE = -11
export const STD_ERROR_HANDLE = -12

export const FORMAT_MESSAGE_FROM_SYSTEM = 0x00001000
export const FORMAT_MESSAGE_IGNORE_INSERTS = 0x00000200

export const ERROR_SUCCESS = 0
export const ERROR_INSUFFICIENT_BUFFER = 122
export const ERROR_BROKEN_PIPE = 109
export const ERROR_NO_DATA = 232
export const ERROR_LOCK_VIOLATION = 33

export const GENERIC_READ = 0x80000000
export const GENERIC_WRITE = 0x40000000
export const FILE_SHARE_READ = 0x00000001
export const FILE_SHARE_WRITE = 0x00000002
export const FILE_SHARE_DELETE = 0x00000004
export const OPEN_ALWAYS = 4
export const LOCKFILE_EXCLUSIVE_LOCK = 0x2
export const LOCKFILE_FAIL_IMMEDIATELY = 0x1

export const ACCESS_ALLOWED_ACE_TYPE = 0

export const SID_MAX_SUB_AUTHORITIES = 15

export const INHERITED_ACE = 0x10

export const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
export const JobObjectExtendedLimitInformation = 9
export const JOBOBJECT_EXTENDED_LIMIT_SIZE = 144
export const JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET = 16

export const SECURITY_MAX_SID_SIZE = 68
export const SID_AND_ATTRIBUTES_SIZE = 16
export const TOKEN_GROUPS_OFFSET = 8
export const EXPLICIT_ACCESS_W_SIZE = 48
export const TRUSTEE_W_OFFSET = 16
export const TRUSTEE_W_PTSTRNAME_OFFSET = 24
export const STARTUPINFOW_SIZE = 104
export const PROCESS_INFORMATION_SIZE = 24
