# userReportOption 接口文档

## 基本信息

- **接口名称**：用户可查询报告的项目选项
- **请求方法**：GET
- **接口路径**：/project/userReportOption
- **微服务地址**：https://api.globaloneclick.org/project
- **鉴权方式**：Bearer Token
- **请求头**：`Authorization: Bearer globaloneclick`

## 请求参数

该接口不需要任何请求参数。

## 响应数据

### 成功响应（HTTP 200）

响应格式：
```json
{
    "code": 200,
    "msg": "操作成功",
    "data": {
        "projectList": [
            {
                "projectId": 123,
                "projectName": "示例项目",
                "iconUrl": "https://example.com/icon.png",
                "adsCostReport": true,
                "biReport": false,
                "userReportPredictInfo": {
                    "recall": "0.85",
                    "precision": "0.90",
                    "originPrecision": "0.88",
                    "precisionIncrease": "0.02"
                },
                "algorithmList": [
                    {
                        "algorithmId": 456,
                        "algorithmName": "算法名称",
                        "startDate": "2024-01-01",
                        "endDate": "2024-12-31"
                    }
                ],
                "hasWaring": false,
                "authorizeErrorAccountList": [
                    {
                        "accountId": "acc_123",
                        "accountName": "广告账号名称",
                        "platform": "GOOGLE_ADS",
                        "tokenStatus": 1,
                        "syncStatus": "SUCCESS"
                    }
                ]
            }
        ]
    }
}
```

### 响应数据结构说明

#### UserReportOptionVo
| 字段名 | 类型 | 描述 |
|--------|------|------|
| projectList | List<UserReportProjectOptionVo> | 项目列表 |

#### UserReportProjectOptionVo
| 字段名 | 类型 | 描述 |
|--------|------|------|
| projectId | Long | 项目ID |
| projectName | String | 项目名称 |
| iconUrl | String | 图标URL |
| adsCostReport | Boolean | 是否有广告平台花费报告 |
| biReport | Boolean | 是否有BI报告 |
| userReportPredictInfo | UserReportPredictInfoVo | 用户报告预测信息 |
| algorithmList | List<UserReportAlgorithmOptionVo> | 算法列表 |
| hasWaring | Boolean | 当天是否有告警 |
| authorizeErrorAccountList | List<AuthorizeErrorAccount> | 账号授权异常列表 |

#### UserReportPredictInfoVo
| 字段名 | 类型 | 描述 |
|--------|------|------|
| recall | String | 模型recall（如果近期真实recall ≤ 80，则用模型的recall） |
| precision | String | 模型precision |
| originPrecision | String | 原始precision |
| precisionIncrease | String | precision提升值 |

#### UserReportAlgorithmOptionVo
| 字段名 | 类型 | 描述 |
|--------|------|------|
| algorithmId | Long | 算法ID |
| algorithmName | String | 算法名称 |
| startDate | String | 开始日期（格式：yyyy-MM-dd） |
| endDate | String | 结束日期（格式：yyyy-MM-dd） |

#### AuthorizeErrorAccount
| 字段名 | 类型 | 描述 |
|--------|------|------|
| accountId | String | 账号ID |
| accountName | String | 账号名称 |
| platform | String | 平台（如：GOOGLE_ADS、META_ADS等） |
| tokenStatus | Long | Token状态 |
| syncStatus | String | 同步状态 |

## 错误响应

### 错误码说明
- `500`: 服务器内部错误
- `401`: 未授权（Token无效）
- `403`: 权限不足

### 错误响应示例
```json
{
    "code": 500,
    "msg": "服务器内部错误",
    "data": null
}
```

## 使用示例

### cURL 示例
```bash
curl -X GET "https://api.globaloneclick.org/project/project/userReportOption" \
  -H "Authorization: Bearer globaloneclick"
```

### JavaScript 示例
```javascript
const response = await fetch('https://api.globaloneclick.org/project/userReportOption', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer globaloneclick'
  }
});

const data = await response.json();
console.log(data.data.projectList);
```

### Python 示例
```python
import requests

url = 'https://api.globaloneclick.org/project/userReportOption'
headers = {
    'Authorization': 'Bearer globaloneclick'
}

response = requests.get(url, headers=headers)
data = response.json()

for project in data['data']['projectList']:
    print(f"项目: {project['projectName']}")
    print(f"是否有广告花费报告: {project['adsCostReport']}")
    print(f"是否有BI报告: {project['biReport']}")
```

## 接口说明

该接口用于获取当前用户有权查看报告的项目列表，每个项目包含以下信息：

1. **基本信息**：项目ID、名称、图标等
2. **报告类型**：是否有广告花费报告、BI报告等
3. **预测信息**：模型的recall和precision指标
4. **算法信息**：项目中可用的算法列表及时间范围
5. **告警状态**：当天是否有告警
6. **账号状态**：是否有账号授权异常

此接口主要用于前端展示用户可以查看哪些项目的报告，以及各项目可用的报告类型。